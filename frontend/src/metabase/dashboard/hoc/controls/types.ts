import type { DisplayTheme } from "metabase/public/lib/types";

export type WritableHashOptions = {
  refresh?: number | null;
  fullscreen?: boolean;
  theme?: DisplayTheme | null;
  hide_parameters?: string | null;
};

export type ReadOnlyHashOptions = {
  bordered?: boolean;
  titled?: boolean;
  hide_download_button?: boolean;
};

export type DashboardUrlHashOptions = WritableHashOptions & ReadOnlyHashOptions;
