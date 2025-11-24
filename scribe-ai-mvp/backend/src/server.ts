import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

type Source = "mic" | "tab";

interface ActiveSession {
  userId: string;
  source: Source;
  startTime: number;
  chunks: string[];
}

const activeSessions = new Map<string, ActiveSession>();

app.use(cors({ origin: "http://localhost:3000" }));

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on(
    "startSession",
    async (data: { userId: string; source: Source }) => {
      try {
        const session = await prisma.session.create({
          data: {
            userId: data.userId,
            transcript: "",
            summary: "",
            status: "recording",
            metadata: {
              source: data.source,
              startTime: new Date().toISOString()
            }
          }
        });

        const sessionId = session.id;
        activeSessions.set(sessionId, {
          userId: data.userId,
          source: data.source,
          startTime: Date.now(),
          chunks: []
        });

        socket.join(sessionId);
        socket.emit("sessionStarted", { sessionId });

        console.log("Session started:", sessionId);
      } catch (err) {
        console.error("startSession error:", err);
        socket.emit("error", { message: "Failed to start session" });
      }
    }
  );

  socket.on(
    "audioChunk",
    async (data: { sessionId: string; chunk: ArrayBuffer; timestamp: number }) => {
      const { sessionId, chunk } = data;
      const session = activeSessions.get(sessionId);
      if (!session) return;

      try {
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash"
        });

        const audioPart = {
          inlineData: {
            mimeType: "audio/webm",
            data: Buffer.from(chunk).toString("base64")
          }
        };

        const result = await model.generateContent([
          {
            text:
              "Transcribe this audio chunk as accurately as possible. " +
              "Respond with ONLY the transcribed text, no timestamps or extra phrasing."
          },
          audioPart as any
        ]);

        const transcriptChunk = (await result.response.text()).trim();
        if (!transcriptChunk) return;

        // Keep in memory until stopSession
        session.chunks.push(transcriptChunk);

        // Stream back to all clients in room
        io.to(sessionId).emit("transcriptChunk", {
          text: transcriptChunk,
          timestamp: data.timestamp
        });
      } catch (err) {
        console.error("audioChunk error:", err);
      }
    }
  );

  socket.on("pauseSession", (sessionId: string) => {
    io.to(sessionId).emit("stateChange", { state: "paused" });
  });

  socket.on("stopSession", async (sessionId: string) => {
    const active = activeSessions.get(sessionId);
    if (!active) return;

    io.to(sessionId).emit("stateChange", { state: "processing" });

    try {
      const fullTranscript = active.chunks.join(" ").trim();

      // Generate summary
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash"
      });

      const summaryResult = await model.generateContent([
        {
          text:
            "You are an assistant generating meeting minutes.\n\n" +
            "Given the following meeting transcript, provide:\n" +
            "- Key Points\n- Decisions\n- Action Items (with owners if mentioned)\n\n" +
            "Transcript:\n\n" +
            fullTranscript
        }
      ]);

      const summary = (await summaryResult.response.text()).trim();

      const durationMs = Date.now() - active.startTime;

      const updated = await prisma.session.update({
        where: { id: sessionId },
        data: {
          transcript: fullTranscript,
          summary,
          status: "completed",
          metadata: {
            ...((await prisma.session.findUnique({ where: { id: sessionId } }))
              ?.metadata || {}),
            durationMs,
            source: active.source
          },
          title:
            summary.split("\n").find((l) => l.trim().length > 0)?.slice(0, 80) ??
            "Untitled Session"
        }
      });

      activeSessions.delete(sessionId);
      io.to(sessionId).emit("sessionCompleted", {
        summary: updated.summary,
        title: updated.title
      });
    } catch (err) {
      console.error("stopSession error:", err);
      io.to(sessionId).emit("error", { message: "Failed to finalize session" });
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
