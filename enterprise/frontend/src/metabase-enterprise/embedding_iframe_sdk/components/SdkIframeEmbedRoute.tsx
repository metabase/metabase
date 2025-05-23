import type { ReactNode } from "react";
import { P, match } from "ts-pattern";

import {
  InteractiveDashboard,
  InteractiveQuestion,
  StaticDashboard,
  StaticQuestion,
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
}): ReactNode => {
  return match(settings)
    .with({ template: "exploration" }, (settings) => (
      <InteractiveQuestion
        questionId="new"
        height="100%"
        isSaveEnabled={settings.isSaveEnabled ?? false}
        targetCollection={settings.targetCollection}
        entityTypeFilter={settings.entityTypes}
      />
    ))
    .with({ template: "curation" }, (_settings) => null)
    .with(
      {
        dashboardId: P.nonNullable,
        drillThroughEnabled: false,
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
        dashboardId: P.nonNullable,
        drillThroughEnabled: true,
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
        drillThroughEnabled: false,
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
        questionId: P.nonNullable,
        drillThroughEnabled: true,
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
