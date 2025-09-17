import { trackSimpleEvent } from "metabase/lib/analytics";
import type {
  SdkIframeEmbedSettingKey,
  SdkIframeEmbedSettings,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type { SdkIframeEmbedSetupExperience } from "./types";
import { filterEmptySettings } from "./utils/filter-empty-settings";

export const trackEmbedWizardExperienceSelected = (
  experience: SdkIframeEmbedSetupExperience,
) =>
  trackSimpleEvent({
    event: "embed_wizard_experience_selected",
    event_detail: experience,
  });

export const trackEmbedWizardResourceSelected = (
  resourceId: number,
  experience: SdkIframeEmbedSetupExperience,
) =>
  trackSimpleEvent({
    event: "embed_wizard_resource_selected",
    target_id: resourceId,
    event_detail: experience,
  });

export const trackEmbedWizardCodeCopied = () =>
  trackSimpleEvent({
    event: "embed_wizard_code_copied",
  });

export const trackEmbedWizardSettingsUpdated = (
  settings: Partial<SdkIframeEmbedSettings>,
) => {
  const filteredSettings = filterEmptySettings(settings);

  const settingKeys = Object.keys(
    filteredSettings,
  ) as SdkIframeEmbedSettingKey[];

  const untrackedKeys: SdkIframeEmbedSettingKey[] = [
    // These keys are not tracked as user settings.
    "instanceUrl",

    // These are tracked via trackEmbedWizardExperienceSelected and trackEmbedWizardResourceSelected
    "questionId",
    "dashboardId",
  ];

  settingKeys.forEach((settingKey) => {
    if (untrackedKeys.includes(settingKey)) {
      return;
    }

    if (settingKey === "useExistingUserSession") {
      trackSimpleEvent({
        event: "embed_wizard_auth_selected",
        event_detail: settings.useExistingUserSession ? "user-session" : "sso",
      });

      return;
    }

    trackSimpleEvent({
      event: "embed_wizard_option_changed",
      event_detail: settingKey,
    });
  });
};
