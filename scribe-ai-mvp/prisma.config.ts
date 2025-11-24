import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",  // Path to your schema (adjust if needed)
  datasource: {
    url: env("DATABASE_URL"),  // Loads from .env for CLI (migrations, generate)
  },
});