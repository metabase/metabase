import { match } from "ts-pattern";

import {
  ALLOWED_EMBED_SETTING_KEYS_MAP,
  type AllowedEmbedSettingKey,
} from "metabase-enterprise/embedding_iframe_sdk/constants";
import type { SdkIframeEmbedBaseSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "../types";

type SettingKey = Exclude<keyof SdkIframeEmbedBaseSettings, "_isLocalhost">;

export function getEmbedSnippet({
  settings,
  instanceUrl,
  experience,
}: {
  settings: SdkIframeEmbedSetupSettings;
  instanceUrl: string;
  experience: SdkIframeEmbedSetupExperience;
}): string {
  const elementName = match(experience)
    .with("dashboard", () => "metabase-dashboard")
    .with("chart", () => "metabase-question")
    .with("exploration", () => "metabase-question")
    .exhaustive();

  const attributes = transformEmbedSettingsToAttributes(
    settings,
    ALLOWED_EMBED_SETTING_KEYS_MAP[experience],
  );

  // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
  return `<script src="${instanceUrl}/app/embed.js"></script>

<script>
  const { defineMetabaseConfig } = window["metabase.embed"];
  defineMetabaseConfig({
    instanceUrl: "${instanceUrl}",${settings.useExistingUserSession ? "\n    useExistingUserSession: true," : ""}${settings.theme ? `\n    theme: ${JSON.stringify(settings.theme)},` : ""}${settings.locale ? `\n    locale: "${settings.locale}",` : ""}
  });
</script>

<${elementName} ${attributes}></${elementName}>`;
}

// Convert camelCase keys to lower-dash-case for web components
const toDashCase = (str: string): string =>
  str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

// Convert values to string attributes
const formatAttributeValue = (value: any): string => {
  if (typeof value === "string") {
    return `"${value}"`;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return `"${value}"`;
  }

  if (Array.isArray(value) || typeof value === "object") {
    return `'${JSON.stringify(value)}'`;
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

    // TODO: rename the setting field to `drills` to match the attribute name
    // transform isDrillThroughEnabled to drills
    if (key === "isDrillThroughEnabled") {
      attributes.push(`drills=${formatAttributeValue(value)}`);
      continue;
    }

    const attributeName = toDashCase(key);
    attributes.push(`${attributeName}=${formatAttributeValue(value)}`);
  }

  return attributes.join(" ");
}
