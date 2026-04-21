import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";

export const getAuthSubTypeForSettings = (
  settings: Partial<SdkIframeEmbedSetupSettings>,
) =>
  settings.isGuest
    ? "none"
    : settings.useExistingUserSession
      ? "user-session"
      : "sso";
