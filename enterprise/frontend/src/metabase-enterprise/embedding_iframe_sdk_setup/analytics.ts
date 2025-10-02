import { trackSimpleEvent } from "metabase/lib/analytics";
import type {
  SdkIframeEmbedSettingKey,
  SdkIframeEmbedSettings,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "./types";
import {
  getDefaultSdkIframeEmbedSettings,
  getResourceIdFromSettings,
} from "./utils/default-embed-setting";

/**
 * Tracking every embed options would bloat Snowplow, so we only track
 * the most relevant options that reveal usage patterns.
 */
const EMBED_OPTIONS_TO_TRACK: SdkIframeEmbedSettingKey[] = [
  "drills",
  "withTitle",
  "withDownloads",
  "isSaveEnabled",
  "readOnly",
];

/**
 * When comparing settings to defaults, we ignore these options as they are already tracked in another step.
 */
const EMBED_OPTIONS_TO_IGNORE: SdkIframeEmbedSettingKey[] = [
  "componentName",
  "dashboardId",
  "questionId",
  "targetCollection",
];

export const trackEmbedWizardOpened = () =>
  trackSimpleEvent({ event: "embed_wizard_opened" });

export const trackEmbedWizardExperienceCompleted = (
  experience: SdkIframeEmbedSetupExperience,
  defaultExperience: SdkIframeEmbedSetupExperience,
) =>
  trackSimpleEvent({
    event: "embed_wizard_experience_completed",
    event_detail:
      experience === defaultExperience ? "default" : `custom=${experience}`,
  });

export const trackEmbedWizardResourceSelectionCompleted = (
  currentSettings: SdkIframeEmbedSetupSettings,
  defaultResourceId: string | number,
) => {
  const currentResourceId = getResourceIdFromSettings(currentSettings) ?? "";
  const isDefault = currentResourceId === defaultResourceId;

  trackSimpleEvent({
    event: "embed_wizard_resource_selection_completed",
    event_detail: isDefault ? "default" : "custom",
  });
};

export const trackEmbedWizardOptionsCompleted = (
  settings: Partial<SdkIframeEmbedSettings>,
  experience: SdkIframeEmbedSetupExperience,
) => {
  // Get defaults for this experience type (with a dummy resource ID)
  const defaultSettings = getDefaultSdkIframeEmbedSettings(experience, 0);

  const hasCustomOptions = hasEmbedOptionsChanged(settings, defaultSettings);

  let options: string[] = [
    `settings=${hasCustomOptions ? "custom" : "default"}`,
  ];

  if (hasCustomOptions) {
    const hasCustomTheme = settings.theme?.colors !== undefined;

    options = [
      ...options,
      `theme=${hasCustomTheme ? "custom" : "default"}`,
      `auth=${settings.useExistingUserSession ? "user_session" : "sso"}`,
    ];

    for (const _optionKey in settings) {
      const optionKey = _optionKey as keyof SdkIframeEmbedSettings;

      if (!EMBED_OPTIONS_TO_TRACK.includes(optionKey)) {
        continue;
      }

      const value = settings[optionKey];

      if (value === undefined) {
        continue;
      }

      options.push(`${optionKey}=${value.toString()}`);
    }
  }

  trackSimpleEvent({
    event: "embed_wizard_options_completed",
    event_detail: options.join(","),
  });
};

/**
 * Check if the embed options have changed from the defaults.
 */
const hasEmbedOptionsChanged = (
  settings: Partial<SdkIframeEmbedSettings>,
  defaultSettings: Partial<SdkIframeEmbedSettings>,
): boolean => {
  for (const _optionKey in settings) {
    const optionKey = _optionKey as keyof SdkIframeEmbedSettings;

    if (
      EMBED_OPTIONS_TO_IGNORE.includes(optionKey as SdkIframeEmbedSettingKey)
    ) {
      continue;
    }

    const settingsValue = settings[optionKey];
    const defaultValue = defaultSettings[optionKey];

    if (settingsValue !== defaultValue) {
      return true;
    }
  }

  return false;
};

export const trackEmbedWizardCodeCopied = (
  authMethod: "sso" | "user_session",
) =>
  trackSimpleEvent({
    event: "embed_wizard_code_copied",
    event_detail: authMethod,
  });
