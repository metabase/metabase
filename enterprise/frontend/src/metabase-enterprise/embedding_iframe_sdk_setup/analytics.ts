import { trackSimpleEvent } from "metabase/lib/analytics";
import type {
  SdkIframeEmbedSettingKey,
  SdkIframeEmbedSettings,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type { SdkIframeEmbedSetupExperience } from "./types";

/**
 * Tracking every embed options would be too much, so we only track
 * the most relevant options that reveal usage patterns.
 */
const EMBED_OPTIONS_TO_TRACK = [
  "drills",
  "withTitle",
  "withDownloads",
  "isSaveEnabled",
  "readOnly",
] as const satisfies SdkIframeEmbedSettingKey[];

export const trackEmbedWizardOpened = () =>
  trackSimpleEvent({
    event: "embed_wizard_opened",
  });

export const trackEmbedWizardExperienceCompleted = (
  experience: SdkIframeEmbedSetupExperience,
) =>
  trackSimpleEvent({
    event: "embed_wizard_experience_completed",
    event_detail: experience,
  });

export const trackEmbedWizardResourceSelectionCompleted = (
  experience: SdkIframeEmbedSetupExperience,
) =>
  trackSimpleEvent({
    event: "embed_wizard_resource_selection_completed",
    event_detail: experience,
  });

export const trackEmbedWizardOptionsCompleted = (
  settings: Partial<SdkIframeEmbedSettings>,
) => {
  const options: Record<string, string> = {
    theme: settings.theme?.colors ? "custom" : "default",
    auth: settings.useExistingUserSession ? "user_session" : "sso",
  };

  for (const optionKey of EMBED_OPTIONS_TO_TRACK) {
    if (!(optionKey in settings)) {
      continue;
    }

    const value = (settings as any)[optionKey];

    if (value === null || value === undefined) {
      continue;
    }

    options[optionKey] = value.toString();
  }

  const eventDetail = Object.entries(options)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");

  trackSimpleEvent({
    event: "embed_wizard_options_completed",
    event_detail: eventDetail,
  });
};

export const trackEmbedWizardCodeCopied = () =>
  trackSimpleEvent({ event: "embed_wizard_code_copied" });
