import { match } from "ts-pattern";

import {
  ALLOWED_EMBED_SETTING_KEYS_MAP,
  ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP,
  type AllowedEmbedSettingKey,
} from "metabase/embedding/embedding-iframe-sdk/constants";
import type {
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  QuestionEmbedOptions,
  SdkIframeEmbedBaseSettings,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";
import type {
  SdkIframeDashboardEmbedSettings,
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
  SdkIframeQuestionEmbedSettings,
} from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { getVisibleParameters } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-visible-parameters";
import type { EntityToken } from "metabase-types/api/entity";

export const buildEmbedAttributes = ({
  settings,
  experience,
  token,
  wrapWithQuotes,
}: {
  settings: SdkIframeEmbedSetupSettings;
  experience: SdkIframeEmbedSetupExperience;
  token: EntityToken | null;
  wrapWithQuotes: boolean;
}) => {
  const isGuestEmbed = !!settings.isGuest;

  const settingsWithOverrides = match(experience)
    .with("chart", () => {
      const questionSettings = settings as SdkIframeQuestionEmbedSettings;

      return {
        ...questionSettings,
        token,
        initialSqlParameters: getVisibleParameters(
          questionSettings.initialSqlParameters,
          questionSettings.lockedParameters,
        ),
        hiddenParameters: questionSettings.hiddenParameters?.length
          ? questionSettings.hiddenParameters
          : undefined,
        entityTypes: questionSettings.entityTypes?.length
          ? questionSettings.entityTypes
          : undefined,
      } as QuestionEmbedOptions;
    })
    .with("exploration", () => {
      const explorationSettings = settings as ExplorationEmbedOptions;

      return {
        ...explorationSettings,
        questionId: "new" as const,
        entityTypes: explorationSettings.entityTypes?.length
          ? explorationSettings.entityTypes
          : undefined,
        template: undefined,
      } as unknown as ExplorationEmbedOptions;
    })
    .with("dashboard", () => {
      const dashboardSettings = settings as SdkIframeDashboardEmbedSettings;

      return {
        ...dashboardSettings,
        token,
        initialParameters: getVisibleParameters(
          dashboardSettings.initialParameters,
          dashboardSettings.lockedParameters,
        ),
        hiddenParameters: dashboardSettings.hiddenParameters?.length
          ? dashboardSettings.hiddenParameters
          : undefined,
      } as DashboardEmbedOptions;
    })
    .otherwise(() => settings);

  return transformEmbedSettingsToAttributes({
    settings: settingsWithOverrides,
    keysToProcess: isGuestEmbed
      ? ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP[experience]
      : ALLOWED_EMBED_SETTING_KEYS_MAP[experience],
    wrapWithQuotes,
  });
};

// Convert camelCase keys to lower-dash-case for web components
const toDashCase = (str: string): string =>
  str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

// Convert values to string attributes
export const formatAttributeValue = (
  value: unknown,
  wrapWithQuotes: boolean = true,
): string => {
  if (Array.isArray(value) || typeof value === "object") {
    const jsonString = JSON.stringify(value);
    const escapedString = jsonString.replace(/'/g, "&#39;");
    return wrapWithQuotes ? `'${escapedString}'` : escapedString;
  }

  return wrapWithQuotes ? `"${value}"` : String(value);
};

type SettingKey = Exclude<keyof SdkIframeEmbedBaseSettings, "_isLocalhost">;

function transformEmbedSettingsToAttributes({
  settings,
  keysToProcess,
  wrapWithQuotes,
}: {
  settings: Partial<SdkIframeEmbedSetupSettings>;
  keysToProcess: AllowedEmbedSettingKey[];
  wrapWithQuotes: boolean;
}): Record<string, string> {
  const attributes: [string, string][] = [];

  for (const key of keysToProcess) {
    const value = (settings as any)[key];

    if (value === undefined || value === null) {
      continue;
    }

    // Skip base configuration keys that go into defineMetabaseConfig
    if (ALLOWED_EMBED_SETTING_KEYS_MAP.base.includes(key as SettingKey)) {
      continue;
    }

    const attributeName = toDashCase(key);

    attributes.push([
      attributeName,
      formatAttributeValue(value, wrapWithQuotes),
    ]);
  }

  return Object.fromEntries(attributes);
}
