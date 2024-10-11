import type { setupEmbedding } from "./setup";

export type History = Awaited<ReturnType<typeof setupEmbedding>>["history"];
