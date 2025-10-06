import _ from "underscore";

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
} from "./utils/get-default-sdk-iframe-embed-setting";

/**
 * Tracking every embed settings would bloat Snowplow, so we only track
 * the most relevant options that reveal usage patterns.
 */
const EMBED_SETTINGS_TO_TRACK: SdkIframeEmbedSettingKey[] = [
  "drills",
  "withTitle",
  "withDownloads",
  "isSaveEnabled",
  "readOnly",
];

/**
 * When comparing settings to defaults, we ignore these options as they are already tracked in another step.
 */
const EMBED_SETTINGS_TO_IGNORE: SdkIframeEmbedSettingKey[] = [
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

const getEmbedSettingsToCompare = (settings: Partial<SdkIframeEmbedSettings>) =>
  _.omit(_.omit(settings, ...EMBED_SETTINGS_TO_IGNORE), _.isUndefined);

export const trackEmbedWizardOptionsCompleted = (
  settings: Partial<SdkIframeEmbedSettings>,
  experience: SdkIframeEmbedSetupExperience,
) => {
  // Get defaults for this experience type (with a dummy resource ID)
  const defaultSettings = getDefaultSdkIframeEmbedSettings({
    experience,
    resourceId: 0,
  });

  // Does the embed settings diverge from the experience defaults?
  const hasCustomOptions = !_.isEqual(
    getEmbedSettingsToCompare(settings),
    getEmbedSettingsToCompare(defaultSettings),
  );

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

      if (!EMBED_SETTINGS_TO_TRACK.includes(optionKey)) {
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

export const trackEmbedWizardCodeCopied = (
  authMethod: "sso" | "user_session",
) =>
  trackSimpleEvent({
    event: "embed_wizard_code_copied",
    event_detail: authMethod,
  });
