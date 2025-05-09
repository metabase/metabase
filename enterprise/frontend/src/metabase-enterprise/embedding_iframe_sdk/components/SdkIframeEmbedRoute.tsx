import { useMemo } from "react";
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

import { SdkIframeInvalidLicenseError } from "./SdkIframeError";

export const SdkIframeEmbedRoute = () => {
  const { embedSettings } = useSdkIframeEmbedEventBus();

  const authConfig = useMemo(() => {
    if (!embedSettings) {
      return;
    }

    // TODO: add support for SSO auth once the new SSO implementation on the SDK is ready
    if (!embedSettings.instanceUrl || !embedSettings.apiKey) {
      return;
    }

    return defineMetabaseAuthConfig({
      metabaseInstanceUrl: embedSettings.instanceUrl,
      apiKey: embedSettings.apiKey,
    });
  }, [embedSettings]);

  // The SDK will show its own loading indicator, so we don't need to show it twice.
  if (embedSettings === null || !authConfig) {
    return null;
  }

  const hasEmbedTokenFeature = PLUGIN_EMBEDDING_IFRAME_SDK.hasValidLicense();

  // If the parent page is not running on localhost and
  // the token feature is not present, we show an error message
  if (!embedSettings._isLocalhost && !hasEmbedTokenFeature) {
    return <SdkIframeInvalidLicenseError />;
  }

  const { theme, locale } = embedSettings;

  return (
    <MetabaseProvider authConfig={authConfig} theme={theme} locale={locale}>
      <Box h="100vh" bg={theme?.colors?.background}>
        <SdkIframeEmbedView settings={embedSettings} />
      </Box>
    </MetabaseProvider>
  );
};

export const SdkIframeEmbedView = ({
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
