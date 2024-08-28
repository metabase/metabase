import type { DisplayTheme } from "metabase/public/lib/types";

type EmbedFlowArtifact = "dashboard" | "question";

export type StaticEmbedDiscardedEvent = {
  event: "static_embed_discarded";
  artifact: EmbedFlowArtifact;
};

type StaticEmbedPublishedParams = {
  locked: number;
  enabled: number;
  disabled: number;
};

export type StaticEmbedPublishedEvent = {
  event: "static_embed_published";
  artifact: EmbedFlowArtifact;
  params: StaticEmbedPublishedParams;
  new_embed: boolean;
  time_since_creation: number;
  time_since_initial_publication: number | null;
  is_example_dashboard: boolean;
};

export type StaticEmbedUnpublishedEvent = {
  event: "static_embed_unpublished";
  artifact: EmbedFlowArtifact;
  time_since_creation: number;
  time_since_initial_publication: number | null;
};

type StaticEmbedCodeCopiedAppearance = {
  background: boolean;
  titled: boolean;
  bordered: boolean;
  theme: DisplayTheme;
  font: "instance" | "custom";
  downloads: boolean | null;
};

export type StaticEmbedCodeCopiedEvent = {
  event: "static_embed_code_copied";
  artifact: EmbedFlowArtifact;
  language: string;
  location: "code_overview" | "code_params" | "code_appearance";
  code: "backend" | "view";
  appearance: StaticEmbedCodeCopiedAppearance;
};

export type PublicLinkCopiedEvent = {
  event: "public_link_copied";
  artifact: EmbedFlowArtifact;
  format: "csv" | "xlsx" | "json" | "html" | null;
};

export type PublicEmbedCodeCopiedEvent = {
  event: "public_embed_code_copied";
  artifact: EmbedFlowArtifact;
  source: "public-embed" | "public-share";
};

export type PublicLinkRemovedEvent = {
  event: "public_link_removed";
  artifact: EmbedFlowArtifact;
  source: "public-embed" | "public-share";
};

export type EmbedFlowEvent =
  | StaticEmbedDiscardedEvent
  | StaticEmbedPublishedEvent
  | StaticEmbedUnpublishedEvent
  | StaticEmbedCodeCopiedEvent
  | PublicLinkCopiedEvent
  | PublicEmbedCodeCopiedEvent
  | PublicLinkRemovedEvent;
