import type { EmbeddingDisplayOptions } from "metabase/public/lib/types";

export type DashboardControlsHashOptions = {
  refresh?: number | null;
  fullscreen?: boolean;
  hide_parameters?: string | null;
};

export type DashboardUrlHashOptions = Partial<
  EmbeddingDisplayOptions & DashboardControlsHashOptions
>;
