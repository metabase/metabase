import { match } from "ts-pattern";
import _ from "underscore";

import {
  ALLOWED_EMBED_SETTING_KEYS_MAP,
  ALLOWED_STATIC_EMBED_SETTING_KEYS_MAP,
  type AllowedEmbedSettingKey,
} from "metabase-enterprise/embedding_iframe_sdk/constants";
import type {
  DashboardEmbedOptions,
  QuestionEmbedOptions,
  SdkIframeEmbedBaseSettings,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";
import { getVisibleParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/utils/get-visible-parameters";

import type {
  SdkIframeDashboardEmbedSettings,
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
  SdkIframeQuestionEmbedSettings,
} from "../types";

import { filterEmptySettings } from "./filter-empty-settings";

type SettingKey = Exclude<keyof SdkIframeEmbedBaseSettings, "_isLocalhost">;

export function getEmbedSnippet({
  settings,
  instanceUrl,
  experience,
  staticEmbeddingSignedToken,
}: {
  settings: SdkIframeEmbedSetupSettings;
  instanceUrl: string;
  experience: SdkIframeEmbedSetupExperience;
  staticEmbeddingSignedToken: string | null;
}): string {
  // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
  return `<script defer src="${instanceUrl}/app/embed.js"></script>
<script>
function defineMetabaseConfig(config) {
  window.metabaseConfig = config;
}
</script>

<script>
  defineMetabaseConfig({
    ${getMetabaseConfigSnippet({
      settings,
      instanceUrl,
    })}
  });
</script>

${getEmbedCustomElementSnippet({
  settings,
  experience,
  staticEmbeddingSignedToken,
})}`;
}

export function getEmbedCustomElementSnippet({
  settings,
  experience,
  staticEmbeddingSignedToken,
}: {
  settings: SdkIframeEmbedSetupSettings;
  experience: SdkIframeEmbedSetupExperience;
  staticEmbeddingSignedToken: string | null;
}): string {
  const isStaticEmbedding = !!settings.isStatic;

  const elementName = match(experience)
    .with("dashboard", () => "metabase-dashboard")
    .with("chart", () => "metabase-question")
    .with("exploration", () => "metabase-question")
    .with("browser", () => "metabase-browser")
    .with("metabot", () => "metabase-metabot")
    .exhaustive();

  const settingsWithOverrides = match(experience)
    .with("chart", () => {
      const questionSettings = settings as SdkIframeQuestionEmbedSettings;

      return {
        ...settings,
        questionId: !settings.isStatic
          ? settings.questionId
          : staticEmbeddingSignedToken,
        initialSqlParameters: getVisibleParameters(
          questionSettings.initialSqlParameters,
          questionSettings.lockedParameters,
        ),
        hiddenParameters: questionSettings.hiddenParameters?.length
          ? questionSettings.hiddenParameters
          : undefined,
      } as QuestionEmbedOptions;
    })
    .with(
      "exploration",
      () =>
        ({
          ...settings,
          questionId: "new" as const,
          template: undefined,
        }) as QuestionEmbedOptions,
    )
    .with("dashboard", () => {
      const dashboardSettings = settings as SdkIframeDashboardEmbedSettings;

      return {
        ...settings,
        dashboardId: !settings.isStatic
          ? settings.dashboardId
          : staticEmbeddingSignedToken,
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

  const attributes = transformEmbedSettingsToAttributes(
    settingsWithOverrides,
    isStaticEmbedding
      ? ALLOWED_STATIC_EMBED_SETTING_KEYS_MAP[experience]
      : ALLOWED_EMBED_SETTING_KEYS_MAP[experience],
  );

  const customElementSnippetParts = [
    staticEmbeddingSignedToken
      ? `<!--\nTHIS IS THE EXAMPLE!\nNEVER HARDCODE THIS JWT TOKEN DIRECTLY IN YOUR HTML!\n\nFetch the JWT token from your backend and programmatically pass it to the '${elementName}'.\n-->`
      : "",
    `<${elementName}${attributes ? ` ${attributes}` : ""}></${elementName}>`,
  ].filter(Boolean);

  return customElementSnippetParts.join("\n");
}

// Convert camelCase keys to lower-dash-case for web components
const toDashCase = (str: string): string =>
  str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

// Convert values to string attributes
export const formatAttributeValue = (value: unknown): string => {
  if (Array.isArray(value) || typeof value === "object") {
    const jsonString = JSON.stringify(value);
    const escapedString = jsonString.replace(/'/g, "&#39;");
    return `'${escapedString}'`;
  }

  return `"${value}"`;
};

export function transformEmbedSettingsToAttributes(
  settings: Partial<SdkIframeEmbedSetupSettings>,
  keysToProcess: AllowedEmbedSettingKey[],
): string {
  const attributes: string[] = [];

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
    attributes.push(`${attributeName}=${formatAttributeValue(value)}`);
  }

  return attributes.join(" ");
}

export function getMetabaseConfigSnippet({
  settings,
  instanceUrl,
}: {
  settings: Partial<SdkIframeEmbedSetupSettings>;
  instanceUrl: string;
}): string {
  const isStaticEmbedding = !!settings.isStatic;

  const config = _.pick(
    settings,
    isStaticEmbedding
      ? ALLOWED_STATIC_EMBED_SETTING_KEYS_MAP.base
      : ALLOWED_EMBED_SETTING_KEYS_MAP.base,
  );

  const cleanedConfig = {
    ..._.omit(config, ["useExistingUserSession"]),

    // Only include useExistingUserSession if it is true.
    ...(config.useExistingUserSession ? { useExistingUserSession: true } : {}),

    // Append these settings that can't be controlled by users.
    instanceUrl,
  };

  // filter out empty arrays, strings, objects, null and undefined.
  // this keeps the embed settings readable.
  const filteredConfig = filterEmptySettings(cleanedConfig);

  // format the json settings with proper indentation
  return JSON.stringify(filteredConfig, null, 2)
    .replace(/^{/, "")
    .replace(/}$/, "")
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
    .trim();
}
