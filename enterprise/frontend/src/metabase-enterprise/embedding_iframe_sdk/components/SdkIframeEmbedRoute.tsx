import type { ReactNode } from "react";
import { useRef } from "react";
import { P, match } from "ts-pattern";

import {
  InteractiveDashboard,
  InteractiveQuestion,
  StaticDashboard,
  StaticQuestion,
  defineMetabaseAuthConfig,
} from "embedding-sdk";
import { MetabaseProviderInternal } from "embedding-sdk/components/public/MetabaseProvider";
import { getSdkStore } from "embedding-sdk/store";
import { setIsSdkIframeEmbedAuth } from "embedding-sdk/store/reducer";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { Box } from "metabase/ui";
import { MetabotProvider } from "metabase-enterprise/metabot/context";

import { useSdkIframeEmbedEventBus } from "../hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "../types/embed";
import type { StoreWithSdkState } from "../types/store";

import {
  SdkIframeApiKeyInProductionError,
  SdkIframeInvalidLicenseError,
} from "./SdkIframeError";

export const SdkIframeEmbedRoute = () => {
  const { embedSettings } = useSdkIframeEmbedEventBus();

  const storeRef = useRef<StoreWithSdkState | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = getSdkStore();

    // Use the iframe embedding auth flow instead.
    storeRef.current.dispatch(setIsSdkIframeEmbedAuth(true));
  }

  // The embed settings won't be available until the parent sends it via postMessage.
  // The SDK will show its own loading indicator, so we don't need to show it twice.
  if (!embedSettings || !embedSettings.instanceUrl) {
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
    <MetabaseReduxProvider store={storeRef.current}>
      <MetabotProvider>
        <MetabaseProviderInternal
          store={storeRef.current}
          authConfig={authConfig}
          theme={theme}
          locale={locale}
        >
          <Box h="100vh" bg={theme?.colors?.background}>
            <SdkIframeEmbedView settings={embedSettings} />
          </Box>
        </MetabaseProviderInternal>
      </MetabotProvider>
    </MetabaseReduxProvider>
  );
};

const SdkIframeEmbedView = ({
  settings,
}: {
  settings: SdkIframeEmbedSettings;
}): ReactNode => {
  return match(settings)
    .with({ template: "exploration" }, (settings) => (
      <InteractiveQuestion
        questionId="new"
        height="100%"
        isSaveEnabled={settings.isSaveEnabled ?? false}
        targetCollection={settings.targetCollection}
        entityTypes={settings.entityTypes}
      />
    ))
    .with({ template: "curate-content" }, (_settings) => null)
    .with({ template: "view-content" }, (_settings) => null)
    .with(
      {
        dashboardId: P.nonNullable,
        isDrillThroughEnabled: false,
      },
      (settings) => (
        <StaticDashboard
          dashboardId={settings.dashboardId}
          withTitle={settings.withTitle}
          withDownloads={settings.withDownloads}
          initialParameters={settings.initialParameters}
          hiddenParameters={settings.hiddenParameters}
        />
      ),
    )
    .with(
      {
        questionId: P.nonNullable,
        isDrillThroughEnabled: false,
      },
      (settings) => (
        <StaticQuestion
          questionId={settings.questionId}
          height="100%"
          initialSqlParameters={settings.initialSqlParameters}
        />
      ),
    )
    .with(
      {
        dashboardId: P.nonNullable,
        isDrillThroughEnabled: P.optional(true),
      },
      (settings) => (
        <InteractiveDashboard
          dashboardId={settings.dashboardId}
          withTitle={settings.withTitle}
          withDownloads={settings.withDownloads}
          initialParameters={settings.initialParameters}
          hiddenParameters={settings.hiddenParameters}
          drillThroughQuestionHeight="100%"
          drillThroughQuestionProps={{ isSaveEnabled: false }}
        />
      ),
    )
    .with(
      {
        questionId: P.nonNullable,
        isDrillThroughEnabled: P.optional(true),
      },
      (settings) => (
        <InteractiveQuestion
          questionId={settings.questionId}
          withDownloads={settings.withDownloads}
          height="100%"
          initialSqlParameters={settings.initialSqlParameters}
          title={settings.withTitle}
          isSaveEnabled={false}
        />
      ),
    )
    .otherwise(() => null);
};
