export const DEFAULT_FONT = "Lato";

export const INSTANCE_VERSION_POLLING_INTERVAL = 60000;

export const getEmbeddingSdkVersion = (): string | "unknown" =>
  (process.env.EMBEDDING_SDK_VERSION as string) ?? "unknown";
