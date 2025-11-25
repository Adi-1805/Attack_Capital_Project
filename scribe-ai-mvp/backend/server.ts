import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import "dotenv/config"; // Loads .env
import { PrismaClient, Prisma } from "@prisma/client";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "http://localhost:3000" },
});

const prisma = new PrismaClient();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on(
  "startSession",
  async (data: { userId: string; source: "mic" | "tab" }) => {
    const session = await prisma.session.create({
      data: {
        user: {
            connect: { id: data.userId } 
        },
        transcript: "", 
        summary: "",
        status: "recording",
        metadata: {
          startTime: new Date().toISOString(),
          duration: 0,
          audioSource: data.source,
        },
        title: null, 
      } satisfies Prisma.SessionCreateInput, 
    });

    socket.join(session.id);
    socket.emit("sessionStarted", { sessionId: session.id });
  });



  socket.on(
    "audioChunk",
    async (data: { sessionId: string; chunk: ArrayBuffer; timestamp: number }) => {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const audioPart = {
        inlineData: {
          mimeType: "audio/webm",
          data: Buffer.from(data.chunk).toString("base64"),
        },
      };
      const result = await model.generateContent([
        {
          text:
            "Transcribe this short audio chunk to text only. Respond with just the new words spoken.",
        },
        audioPart,
      ]);
      const transcriptChunk = await result.response.text();

      io.to(data.sessionId).emit("transcriptChunk", {
        text: transcriptChunk,
        timestamp: data.timestamp,
      });

      // Append to session transcript (fetch current, concat, update)
      const currentSession = await prisma.session.findUnique({
        where: { id: data.sessionId },
      });
      const newTranscript =
        (currentSession?.transcript || "") + " " + transcriptChunk;
      await prisma.session.update({
        where: { id: data.sessionId },
        data: { transcript: newTranscript },
      });
    }
  );

  socket.on("pauseSession", (sessionId: string) => {
    io.to(sessionId).emit("stateChange", { state: "paused" });
    prisma.session.update({
      where: { id: sessionId },
      data: { status: "paused" },
    });
  });

  socket.on("stopSession", async (sessionId: string) => {
    io.to(sessionId).emit("stateChange", { state: "processing" });

    try {
      // 1. Get current session from DB
      const dbSession = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!dbSession) {
        io.to(sessionId).emit("sessionCompleted", {
          summary: "No transcript generated.",
          title: "Unknown session",
        });
        return;
      }

      // 2. Use DB transcript
      const transcript = dbSession.transcript || "";

      if (!transcript.trim()) {
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            status: "completed",
            summary: "No transcript available.",
          },
        });

        io.to(sessionId).emit("sessionCompleted", {
          summary: "No transcript available.",
          title: "Untitled Meeting",
        });
        return;
      }

      // 3. Generate summary with Gemini
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const summaryResult = await model.generateContent([
        {
          text:
            "Summarize this meeting transcript into key points, decisions, and action items. " +
            "Keep it concise.\n\nTranscript:\n\n" +
            transcript,
        },
      ]);

      const summary = (await summaryResult.response.text()).trim();

      // 4. Compute duration from metadata.startTime if present
      const metadata = (dbSession.metadata ?? {}) as any;
      const startTimeStr =
        metadata.startTime ?? dbSession.createdAt.toISOString();
      const durationMs =
        Date.now() - new Date(startTimeStr as string).getTime();

      const title =
        summary.split("\n").find((l) => l.trim().length > 0)?.slice(0, 50) ||
        "Untitled Meeting";

      // 5. Update session in DB
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          summary,
          status: "completed",
          title,
          metadata: {
            ...metadata,
            durationMs,
          } as any,
        },
      });

      // 6. Notify client
      io.to(sessionId).emit("sessionCompleted", { summary, title });
    } catch (err) {
      console.error("stopSession error:", err);
      io.to(sessionId).emit("error", {
        message: "Failed to finalize session",
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = 4000;
httpServer.listen(PORT, () => {
  console.log(`Socket.io server running on http://localhost:${PORT}`);
});
