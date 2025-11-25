import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";

export const getAuthTypeForSettings = (
  settings: SdkIframeEmbedSetupSettings,
) =>
  settings.isGuestEmbed
    ? "guest-embed"
    : settings.useExistingUserSession
      ? "user-session"
      : "sso";
