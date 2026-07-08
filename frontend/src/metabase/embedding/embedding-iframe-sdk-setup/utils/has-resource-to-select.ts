import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";

/**
 * Whether the experience needs a specific resource picked by the user
 * (dashboard, chart, or initial collection for the browser). Exploration and
 * Metabot have nothing to select.
 */
export const hasResourceToSelect = (
  experience: SdkIframeEmbedSetupExperience,
): experience is "dashboard" | "chart" | "browser" =>
  ["dashboard", "chart", "browser"].includes(experience);
