export type EmbeddingEnabledEvent = {
  event: "embedding_enabled";
  authorized_origins_set: boolean;
  number_embedded_questions: number;
  number_embedded_dashboards: number;
};

export type EmbeddingDisabledEvent = {
  event: "embedding_disabled";
  authorized_origins_set: boolean;
  number_embedded_questions: number;
  number_embedded_dashboards: number;
};

export type EmbedShareEvent = EmbeddingEnabledEvent | EmbeddingDisabledEvent;
