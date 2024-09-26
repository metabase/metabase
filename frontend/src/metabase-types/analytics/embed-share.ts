type EmbedShareEventSchema = {
  event: string;
  authorized_origins_set?: boolean | null;
  number_embedded_questions?: number | null;
  number_embedded_dashboards?: number | null;
};

type ValidateEvent<
  T extends EmbedShareEventSchema &
    Record<Exclude<keyof T, keyof EmbedShareEventSchema>, never>,
> = T;

export type EmbeddingEnabledEvent = ValidateEvent<{
  event: "embedding_enabled";
  authorized_origins_set: boolean;
  number_embedded_questions: number;
  number_embedded_dashboards: number;
}>;

export type EmbeddingDisabledEvent = ValidateEvent<{
  event: "embedding_disabled";
  authorized_origins_set: boolean;
  number_embedded_questions: number;
  number_embedded_dashboards: number;
}>;

export type EmbedShareEvent = EmbeddingEnabledEvent | EmbeddingDisabledEvent;
