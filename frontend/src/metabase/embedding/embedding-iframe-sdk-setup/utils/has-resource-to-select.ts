import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/types";

/**
 * Whether the experience needs a specific resource picked by the user
 * (dashboard, chart, data app, or initial collection for the browser). Exploration and
 * Metabot have nothing to select.
 */
export const hasResourceToSelect = (
  experience: SdkIframeEmbedSetupExperience,
): experience is "dashboard" | "chart" | "browser" | "app" =>
  ["dashboard", "chart", "browser", "app"].includes(experience);
