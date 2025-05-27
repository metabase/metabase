import { P, match } from "ts-pattern";

import {
  InteractiveDashboard,
  InteractiveQuestion,
  defineMetabaseAuthConfig,
} from "embedding-sdk";
import { MetabaseProvider } from "embedding-sdk/components/public/MetabaseProvider";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { Box } from "metabase/ui";

import { useSdkIframeEmbedEventBus } from "../hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "../types/embed";

import {
  SdkIframeApiKeyInProductionError,
  SdkIframeInvalidLicenseError,
} from "./SdkIframeError";

export const SdkIframeEmbedRoute = () => {
  const { embedSettings } = useSdkIframeEmbedEventBus();

  // The embed settings won't be available until the parent sends it via postMessage.
  // The SDK will show its own loading indicator, so we don't need to show it twice.
  if (!embedSettings || !embedSettings.instanceUrl || !embedSettings.apiKey) {
    return null;
  }

  const hasEmbedTokenFeature = PLUGIN_EMBEDDING_IFRAME_SDK.hasValidLicense();

  // If the parent page is not running on localhost and
  // the token feature is not present, we show an error message
  if (!embedSettings._isLocalhost && !hasEmbedTokenFeature) {
    return <SdkIframeInvalidLicenseError />;
  }

  // Using API keys in production is not allowed. SSO is required.
  if (!embedSettings._isLocalhost && embedSettings.apiKey) {
    return <SdkIframeApiKeyInProductionError />;
  }

  const { theme, locale } = embedSettings;

  const authConfig = defineMetabaseAuthConfig({
    metabaseInstanceUrl: embedSettings.instanceUrl,
    apiKey: embedSettings.apiKey,
  });

  return (
    <MetabaseProvider authConfig={authConfig} theme={theme} locale={locale}>
      <Box h="100vh" bg={theme?.colors?.background}>
        <SdkIframeEmbedView settings={embedSettings} />
      </Box>
    </MetabaseProvider>
  );
};

const SdkIframeEmbedView = ({
  settings,
}: {
  settings: SdkIframeEmbedSettings;
}) => {
  const { dashboardId, questionId, template } = settings;

  return match({ dashboardId, questionId, template })
    .with({ template: "exploration" }, () => (
      <InteractiveQuestion
        questionId="new"
        height="100%"
        isSaveEnabled={false}
      />
    ))
    .with({ dashboardId: P.nonNullable }, ({ dashboardId }) => (
      <InteractiveDashboard
        dashboardId={dashboardId}
        drillThroughQuestionHeight="100%"
      />
    ))
    .with({ questionId: P.nonNullable }, ({ questionId }) => (
      <InteractiveQuestion questionId={questionId} height="100%" />
    ))
    .otherwise(() => null);
};
