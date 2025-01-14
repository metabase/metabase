import type {
  EmbeddingAdditionalHashOptions,
  EmbeddingDisplayOptions,
} from "metabase/public/lib/types";

/**
 * This is a type that controls some dashboard states.
 */
export type DashboardControlsHashOptions = {
  refresh?: number | null;
  fullscreen?: boolean;
  scrollTo?: number;
};

export type DashboardUrlHashOptions = Partial<
  EmbeddingDisplayOptions &
    DashboardControlsHashOptions &
    EmbeddingAdditionalHashOptions
>;
