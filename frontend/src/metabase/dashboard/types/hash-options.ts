import type {
  AdditionalEmbeddingHashOptions,
  EmbeddingDisplayOptions,
} from "metabase/public/lib/types";

export type DashboardControlsHashOptions = {
  refresh?: number | null;
  fullscreen?: boolean;
};

export type DashboardUrlHashOptions = Partial<
  EmbeddingDisplayOptions &
    DashboardControlsHashOptions &
    AdditionalEmbeddingHashOptions
>;
