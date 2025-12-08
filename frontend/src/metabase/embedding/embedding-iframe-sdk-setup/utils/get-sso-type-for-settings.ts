import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";

export const getSsoTypeForSettings = (
  settings: Partial<SdkIframeEmbedSetupSettings>,
) => (settings.useExistingUserSession ? "user-session" : "sso");
