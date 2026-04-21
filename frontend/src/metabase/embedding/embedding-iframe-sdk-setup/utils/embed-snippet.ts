import { match } from "ts-pattern";
import _ from "underscore";

import {
  ALLOWED_EMBED_SETTING_KEYS_MAP,
  ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP,
} from "metabase/embedding/embedding-iframe-sdk/constants";
import { buildEmbedAttributes } from "metabase/embedding/embedding-iframe-sdk-setup/utils/build-embed-attributes";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "../types";

import { filterEmptySettings } from "./filter-empty-settings";

export function getEmbedSnippet({
  settings,
  instanceUrl,
  experience,
  guestEmbedSignedTokenForSnippet,
}: {
  settings: SdkIframeEmbedSetupSettings;
  instanceUrl: string;
  experience: SdkIframeEmbedSetupExperience;
  guestEmbedSignedTokenForSnippet: string | null;
}): string {
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
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
  guestEmbedSignedTokenForSnippet,
})}`;
}

export function getEmbedCustomElementSnippet({
  settings,
  experience,
  guestEmbedSignedTokenForSnippet,
}: {
  settings: SdkIframeEmbedSetupSettings;
  experience: SdkIframeEmbedSetupExperience;
  guestEmbedSignedTokenForSnippet: string | null;
}): string {
  const isGuestEmbed = !!settings.isGuest;

  const elementName = match(experience)
    .with("dashboard", () => "metabase-dashboard")
    .with("chart", () => "metabase-question")
    .with("exploration", () => "metabase-question")
    .with("browser", () => "metabase-browser")
    .with("metabot", () => "metabase-metabot")
    .exhaustive();

  const attributes = buildEmbedAttributes({
    experience,
    settings,
    token: guestEmbedSignedTokenForSnippet,
    wrapWithQuotes: true,
  });

  const attributesString = Object.entries(attributes)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");

  const customElementSnippetParts = [
    isGuestEmbed && guestEmbedSignedTokenForSnippet
      ? `<!--\nTHIS IS THE EXAMPLE!\nNEVER HARDCODE THIS JWT TOKEN DIRECTLY IN YOUR HTML!\n\nFetch the JWT token from your backend and programmatically pass it to the '${elementName}'.\n-->`
      : "",
    `<${elementName}${attributesString.trim() ? ` ${attributesString}` : ""}></${elementName}>`,
  ].filter(Boolean);

  return customElementSnippetParts.join("\n");
}

export function getMetabaseConfigSnippet({
  settings,
  instanceUrl,
}: {
  settings: Partial<SdkIframeEmbedSetupSettings>;
  instanceUrl: string;
}): string {
  const isGuestEmbed = !!settings.isGuest;

  const config = _.pick(
    settings,
    isGuestEmbed
      ? ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP.base
      : ALLOWED_EMBED_SETTING_KEYS_MAP.base,
  );

  const cleanedConfig = {
    ..._.omit(config, ["isGuest", "useExistingUserSession"]),

    // Only include settings below when they are true.
    ...(config.useExistingUserSession ? { useExistingUserSession: true } : {}),
    ...(isGuestEmbed ? { isGuest: true } : {}),

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
