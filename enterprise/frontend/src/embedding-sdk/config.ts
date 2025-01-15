export const DEFAULT_FONT = "Lato";

export const getEmbeddingSdkVersion = (): string | "unknown" =>
  (process.env.EMBEDDING_SDK_VERSION as string) ?? "unknown";
