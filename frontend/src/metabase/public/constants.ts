import { DEFAULT_DASHBOARD_DISPLAY_OPTIONS } from "metabase/dashboard/constants";

export const DEFAULT_EMBED_DISPLAY_PARAMS = {
  titled: DEFAULT_DASHBOARD_DISPLAY_OPTIONS.titled,
  theme: undefined,
  hideParameters: DEFAULT_DASHBOARD_DISPLAY_OPTIONS.hideParameters,
  hideDownloadButton: DEFAULT_DASHBOARD_DISPLAY_OPTIONS.hideDownloadButton,
} as const;
