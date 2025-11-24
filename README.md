# ScribeAI MVP
Real-time AI meeting transcriber using Next.js, Socket.io, Prisma, Better Auth, and Google Gemini.

## Architecture
- **Frontend**: Next.js 14+ (App Router, TS) for UI, auth, recording (MediaRecorder for chunked audio).
- **Backend**: Node.js + Socket.io for real-time streaming, Gemini proxy (avoids CORS), state management.
- **DB**: Postgres + Prisma for user sessions (transcript, summary, metadata).
- **Auth**: Better Auth (email/password; extend to OAuth).
- **AI**: Gemini 1.5 Flash for low-latency transcription (chunked) and summarization.
- **UI**: TailwindCSS for responsive, minimal design.
- **Chunking**: 25s audio blobs via MediaRecorder.timeslice for 1hr+ sessions.
- **States**: idle/recording/paused/processing/completed via Socket.io + DB.

## Setup
1. Clone/copy files. Add `.env`: `DATABASE_URL` (Postgres URI), `GOOGLE_API_KEY` (from Google AI Studio).
2. In root: `npx prisma db push && npx prisma generate`.
3. `npm run dev` (frontend:3000, backend:4000).
4. Login at `/login`, record at `/scribe`, view at `/history`.

## Endpoints
- `/api/auth/[...better-auth]`: Auth handlers.
- `/api/sessions`: GET user sessions (protected).

## Limitations & Extensions
- Local dev only; deploy backend separately (e.g., Render), frontend to Vercel.
- Transcription: ~85-90% accuracy (clear English audio); no diarization/speaker ID.
- No multi-user; single-session rooms.
- Extend: Web Audio API for precise chunk timing, streaming Gemini responses, file upload, export PDF.
- Issues? Check browser console (permissions/Socket), server logs (Gemini key/DB).


This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
