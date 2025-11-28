import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";

export const getAuthTypeForSettings = (
  settings: Partial<SdkIframeEmbedSetupSettings>,
) =>
  settings.isGuest
    ? "guest_embed"
    : settings.useExistingUserSession
      ? "user_session"
      : "sso";
