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

type EmbeddingEventName =
  | "embedding"
  | "sdk_embedding"
  | "interactive_embedding"
  | "static_embedding";

type EmbeddingEventEnabled = `${EmbeddingEventName}_enabled`;
type EmbeddingEventDisabled = `${EmbeddingEventName}_disabled`;

export type EmbeddingEnabledEvent = ValidateEvent<{
  event: EmbeddingEventEnabled;
  authorized_origins_set: boolean;
  number_embedded_questions: number;
  number_embedded_dashboards: number;
}>;

export type EmbeddingDisabledEvent = ValidateEvent<{
  event: EmbeddingEventDisabled;
  authorized_origins_set: boolean;
  number_embedded_questions: number;
  number_embedded_dashboards: number;
}>;

export type EmbedShareEvent = EmbeddingEnabledEvent | EmbeddingDisabledEvent;
