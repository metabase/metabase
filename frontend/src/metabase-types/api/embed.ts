export type DisplayTheme = "light" | "night" | "transparent";

export type EmbeddingType = "static-legacy" | "guest-embed";

export type EmbeddingParameterVisibility = "disabled" | "enabled" | "locked";

export type EmbeddingParameters = Record<string, EmbeddingParameterVisibility>;
