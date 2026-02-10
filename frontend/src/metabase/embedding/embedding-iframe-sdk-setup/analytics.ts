import _ from "underscore";

import type {
  SdkIframeEmbedSettingKey,
  SdkIframeEmbedSettings,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";
import { getAuthSubTypeForSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-auth-sub-type-for-settings";
import { getAuthTypeForSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-auth-type-for-settings";
import { countEmbeddingParameterOptions } from "metabase/embedding/lib/count-embedding-parameter-options";
import { trackSimpleEvent } from "metabase/lib/analytics";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import type { Card, Dashboard } from "metabase-types/api";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "./types";
import {
  getDefaultSdkIframeEmbedSettings,
  getResourceIdFromSettings,
} from "./utils/get-default-sdk-iframe-embed-setting";

export const UTM_LOCATION = "embedded_analytics_js_wizard";

export const UPSELL_CAMPAIGN_EXPERIENCE = "embedding_experience";
export const UPSELL_CAMPAIGN_BEHAVIOR = "embedding_behavior";

export const SETUP_SSO_CAMPAIGN = "embedding_get_code";

/**
 * Tracking every embed settings would bloat Snowplow, so we only track
 * the most relevant options that reveal usage patterns.
 */
const EMBED_SETTINGS_TO_TRACK: SdkIframeEmbedSettingKey[] = [
  "drills",
  "withTitle",
  "withDownloads",
  "withSubscriptions",
  "withAlerts",
  "isSaveEnabled",
  "readOnly",
  "layout",
];

/**
 * When comparing settings to defaults, we ignore these options as they are already tracked in another step.
 */
const EMBED_SETTINGS_TO_IGNORE: SdkIframeEmbedSettingKey[] = [
  "componentName",
  "dashboardId",
  "questionId",
  "targetCollection",
  "hiddenParameters",
  "lockedParameters",
];

export const trackEmbedWizardOpened = () =>
  trackSimpleEvent({ event: "embed_wizard_opened" });

export const trackEmbedWizardExperienceCompleted = ({
  experience,
  defaultExperience,
  settings,
}: {
  experience: SdkIframeEmbedSetupExperience;
  defaultExperience: SdkIframeEmbedSetupExperience;
  settings: Partial<SdkIframeEmbedSetupSettings>;
}) => {
  const authType = getAuthTypeForSettings(settings);
  const isDefaultExperience = experience === defaultExperience;

  const eventDetailsParts: string[] = [
    `authType=${authType}`,
    `experience=${experience}`,
    `isDefaultExperience=${isDefaultExperience}`,
  ];

  trackSimpleEvent({
    event: "embed_wizard_experience_completed",
    event_detail: buildEventDetails(eventDetailsParts),
  });
};

export const trackEmbedWizardResourceSelectionCompleted = ({
  experience,
  currentSettings,
  defaultResourceId,
}: {
  experience: SdkIframeEmbedSetupExperience;
  currentSettings: SdkIframeEmbedSetupSettings;
  defaultResourceId: string | number;
}) => {
  const currentResourceId = getResourceIdFromSettings(currentSettings) ?? "";
  const isDefaultResource = currentResourceId === defaultResourceId;

  const eventDetailsParts: string[] = [
    `isDefaultResource=${isDefaultResource}`,
    `experience=${experience}`,
  ];

  trackSimpleEvent({
    event: "embed_wizard_resource_selection_completed",
    event_detail: buildEventDetails(eventDetailsParts),
  });
};

const getEmbedSettingsToCompare = (settings: Partial<SdkIframeEmbedSettings>) =>
  _.omit(_.omit(settings, ...EMBED_SETTINGS_TO_IGNORE), _.isUndefined);

export const trackEmbedWizardOptionsCompleted = ({
  experience,
  resource,
  settings,
  isSimpleEmbedFeatureAvailable,
  isGuestEmbedsEnabled,
  isSsoEnabledAndConfigured,
  embeddingParameters,
}: {
  initialState: SdkIframeEmbedSetupModalInitialState | undefined;
  experience: SdkIframeEmbedSetupExperience;
  resource: Dashboard | Card | null;
  settings: Partial<SdkIframeEmbedSetupSettings>;
  isSimpleEmbedFeatureAvailable: boolean;
  isGuestEmbedsEnabled: boolean;
  isSsoEnabledAndConfigured: boolean;
  embeddingParameters: EmbeddingParameters;
}) => {
  // Get defaults for this experience type (with a dummy resource ID)
  const defaultSettings = getDefaultSdkIframeEmbedSettings({
    experience,
    resourceId: 0,
    isSimpleEmbedFeatureAvailable,
    isGuestEmbedsEnabled,
    isSsoEnabledAndConfigured,
    isGuest: !!settings.isGuest,
    useExistingUserSession: !!settings.useExistingUserSession,
  });

  // Does the embed settings diverge from the experience defaults?
  const hasCustomOptions = !_.isEqual(
    getEmbedSettingsToCompare(settings),
    getEmbedSettingsToCompare(defaultSettings),
  );

  const eventDetailsParts: (string | null)[] = [
    `settings=${hasCustomOptions ? "custom" : "default"}`,
  ];

  if (hasCustomOptions) {
    const authType = getAuthTypeForSettings(settings);
    const params = countEmbeddingParameterOptions(embeddingParameters);
    const hasCustomTheme = settings.theme?.colors !== undefined;

    eventDetailsParts.push(
      ...[
        `experience=${experience}`,
        ...buldEventDetailsPartsForGuestEmbedResource({ resource, settings }),
        `authType=${authType}`,
        ...buildEventDetailsPartsForSettings(settings),
        ...(settings.isGuest ? [`params=${JSON.stringify(params)}`] : []),
        `theme=${hasCustomTheme ? "custom" : "default"}`,
      ],
    );
  }

  trackSimpleEvent({
    event: "embed_wizard_options_completed",
    event_detail: buildEventDetails(eventDetailsParts),
  });
};

export const trackEmbedWizardCodeCopied = ({
  experience,
  resource,
  snippetType,
  settings,
}: {
  experience: SdkIframeEmbedSetupExperience;
  resource: Dashboard | Card | null;
  snippetType: "frontend" | "server";
  settings: SdkIframeEmbedSetupSettings;
}) => {
  const authSubType = getAuthSubTypeForSettings(settings);

  const eventDetailsParts: (string | null)[] = [
    `experience=${experience}`,
    `snippetType=${snippetType}`,
    ...buldEventDetailsPartsForGuestEmbedResource({ resource, settings }),
    `authSubType=${authSubType}`,
  ];

  trackSimpleEvent({
    event: "embed_wizard_code_copied",
    event_detail: buildEventDetails(eventDetailsParts),
  });
};

const buldEventDetailsPartsForGuestEmbedResource = ({
  resource,
  settings,
}: {
  resource: Dashboard | Card | null;
  settings: Partial<SdkIframeEmbedSetupSettings>;
}) => [
  ...(settings.isGuest
    ? [
        resource?.enable_embedding !== undefined
          ? `guestEmbedEnabled=${resource.enable_embedding}`
          : null,
        resource?.embedding_type
          ? `guestEmbedType=${resource.embedding_type}`
          : null,
      ]
    : []),
];

const buildEventDetailsPartsForSettings = (
  settings: Partial<SdkIframeEmbedSettings>,
) => {
  const options: string[] = [];

  for (const _optionKey in settings) {
    const optionKey = _optionKey as keyof SdkIframeEmbedSettings;

    if (!EMBED_SETTINGS_TO_TRACK.includes(optionKey)) {
      continue;
    }

    const value = settings[optionKey];

    if (value === undefined || value === null) {
      continue;
    }

    options.push(`${optionKey}=${value.toString()}`);
  }

  return options;
};

const buildEventDetails = (eventDetailsParts: (string | null)[]): string =>
  eventDetailsParts.filter(Boolean).join(",");
