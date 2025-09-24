import { trackSimpleEvent } from "metabase/lib/analytics";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type { SdkIframeEmbedSetupExperience } from "./types";

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
  const customOptions = [];

  if (settings.theme) {
    customOptions.push("custom-theme");
  }

  if (settings.useExistingUserSession === false) {
    customOptions.push("custom-auth");
  }

  const eventDetail =
    customOptions.length > 0 ? customOptions.join(",") : "default";

  trackSimpleEvent({
    event: "embed_wizard_options_completed",
    event_detail: eventDetail,
  });
};

export const trackEmbedWizardCodeCopied = () =>
  trackSimpleEvent({
    event: "embed_wizard_code_copied",
  });
