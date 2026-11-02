import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/types";

/**
 * Whether the experience offers an auth choice (SSO vs Guest). True only for
 * the experiences that support guest embedding — others are SSO-only and
 * don't need the Authentication card.
 */
export const hasAuthToSelect = (
  experience: SdkIframeEmbedSetupExperience,
): experience is "dashboard" | "chart" =>
  ["dashboard", "chart"].includes(experience);
