type EmbedFlowParams = {
  locked?: number;
  enabled?: number;
  disabled?: number;
};

type EmbedFlowAppearance = {
  background?: boolean;
  titled?: boolean;
  bordered?: boolean;
  theme?: string;
  font?: string;
  downloads?: boolean | null;
  hide_download_button?: boolean | null;
};

type EmbedFlowEventSchema = {
  event: string;
  artifact: string;
  new_embed?: boolean | null;
  params?: EmbedFlowParams | null;
  first_published_at?: string | null;
  language?: string | null;
  location?: string | null;
  code?: string | null;
  appearance?: EmbedFlowAppearance | null;
  format?: string | null;
  source?: string | null;
  time_since_creation?: number | null;
  time_since_initial_publication?: number | null;
  is_example_dashboard?: boolean | null;
};

type ValidateEvent<
  T extends EmbedFlowEventSchema &
    Record<Exclude<keyof T, keyof EmbedFlowEventSchema>, never>,
> = T;

type EmbedFlowArtifact = "dashboard" | "question";

export type StaticEmbedDiscardedEvent = ValidateEvent<{
  event: "static_embed_discarded";
  artifact: EmbedFlowArtifact;
}>;

export type StaticEmbedPublishedEvent = ValidateEvent<{
  event: "static_embed_published";
  artifact: EmbedFlowArtifact;
  params: EmbedFlowParams;
  new_embed: boolean;
  time_since_creation: number;
  time_since_initial_publication: number | null;
  is_example_dashboard: boolean;
}>;

export type StaticEmbedUnpublishedEvent = ValidateEvent<{
  event: "static_embed_unpublished";
  artifact: EmbedFlowArtifact;
  time_since_creation: number;
  time_since_initial_publication: number | null;
}>;

export type StaticEmbedCodeCopiedEvent = ValidateEvent<{
  event: "static_embed_code_copied";
  artifact: EmbedFlowArtifact;
  language: string;
  location: "code_overview" | "code_params" | "code_appearance";
  code: "backend" | "view";
  appearance: EmbedFlowAppearance;
}>;

export type PublicLinkCopiedEvent = ValidateEvent<{
  event: "public_link_copied";
  artifact: EmbedFlowArtifact;
  format: "csv" | "xlsx" | "json" | "html" | null;
}>;

export type PublicEmbedCodeCopiedEvent = ValidateEvent<{
  event: "public_embed_code_copied";
  artifact: EmbedFlowArtifact;
  source: "public-embed" | "public-share";
}>;

export type PublicLinkRemovedEvent = ValidateEvent<{
  event: "public_link_removed";
  artifact: EmbedFlowArtifact;
  source: "public-embed" | "public-share";
}>;

export type EmbedFlowEvent =
  | StaticEmbedDiscardedEvent
  | StaticEmbedPublishedEvent
  | StaticEmbedUnpublishedEvent
  | StaticEmbedCodeCopiedEvent
  | PublicLinkCopiedEvent
  | PublicEmbedCodeCopiedEvent
  | PublicLinkRemovedEvent;
