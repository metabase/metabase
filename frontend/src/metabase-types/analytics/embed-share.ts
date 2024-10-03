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

type EnabledType = "enabled" | "disabled";
type EmbeddingEventName =
  | "embedding"
  | "sdk_embedding"
  | "interactive_embedding"
  | "static_embedding";

type EmbeddingEvent = `${EmbeddingEventName}_${EnabledType}`;

export type EmbeddingEnabledEvent = ValidateEvent<{
  event: EmbeddingEvent;
  authorized_origins_set: boolean;
  number_embedded_questions: number;
  number_embedded_dashboards: number;
}>;

export type EmbeddingDisabledEvent = ValidateEvent<{
  event: EmbeddingEvent;
  authorized_origins_set: boolean;
  number_embedded_questions: number;
  number_embedded_dashboards: number;
}>;

export type EmbedShareEvent = EmbeddingEnabledEvent | EmbeddingDisabledEvent;
