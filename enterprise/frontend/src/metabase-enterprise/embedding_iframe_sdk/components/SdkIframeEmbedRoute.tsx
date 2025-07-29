import type { ReactNode } from "react";
import { P, match } from "ts-pattern";

import {
  InteractiveDashboard,
  InteractiveQuestion,
  MetabaseProvider,
  StaticDashboard,
  defineMetabaseAuthConfig,
} from "embedding-sdk";
import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion";
import { StaticQuestionSdkMode } from "embedding-sdk/components/public/StaticQuestion/mode";
import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { Box } from "metabase/ui";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

import { useParamRerenderKey } from "../hooks/use-param-rerender-key";
import { useSdkIframeEmbedEventBus } from "../hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "../types/embed";

import {
  SdkIframeApiKeyInProductionError,
  SdkIframeExistingUserSessionInProductionError,
  SdkIframeInvalidLicenseError,
} from "./SdkIframeError";

const onSettingsChanged = (settings: SdkIframeEmbedSettings) => {
  // Tell the SDK whether to use the existing user session or not.
  EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.useExistingUserSession =
    settings?.useExistingUserSession || false;
};

export const SdkIframeEmbedRoute = () => {
  const { embedSettings } = useSdkIframeEmbedEventBus({ onSettingsChanged });

  // The embed settings won't be available until the parent sends it via postMessage.
  // The SDK will show its own loading indicator, so we don't need to show it twice.
  if (!embedSettings || !embedSettings.instanceUrl) {
    return null;
  }

  const hasEmbedTokenFeature = PLUGIN_EMBEDDING_IFRAME_SDK.hasValidLicense();

  const isProduction = !embedSettings._isLocalhost;

  // If the parent page is not running on localhost and
  // the token feature is not present, we show an error message
  if (isProduction && !hasEmbedTokenFeature) {
    return <SdkIframeInvalidLicenseError />;
  }

  // Using API keys in production is not allowed. SSO is required.
  if (isProduction && embedSettings.apiKey) {
    return <SdkIframeApiKeyInProductionError />;
  }

  // Using the existing user's session in production is not allowed. SSO is required.
  if (isProduction && embedSettings.useExistingUserSession) {
    return <SdkIframeExistingUserSessionInProductionError />;
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
  const rerenderKey = useParamRerenderKey(settings);

  return match(settings)
    .with({ template: "exploration" }, (settings) => (
      <InteractiveQuestion
        questionId="new"
        height="100%"
        isSaveEnabled={settings.isSaveEnabled ?? false}
        targetCollection={settings.targetCollection}
        entityTypes={settings.entityTypes}
        key={rerenderKey}
      />
    ))
    .with({ template: "curate-content" }, (_settings) => null)
    .with({ template: "view-content" }, (_settings) => null)
    .with(
      {
        dashboardId: P.nonNullable,
        drills: false,
      },
      (settings) => (
        <StaticDashboard
          dashboardId={settings.dashboardId}
          withTitle={settings.withTitle}
          withDownloads={settings.withDownloads}
          initialParameters={settings.initialParameters}
          hiddenParameters={settings.hiddenParameters}
          key={rerenderKey}
        />
      ),
    )
    .with(
      {
        dashboardId: P.nonNullable,
        drills: P.optional(true),
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
          key={rerenderKey}
        />
      ),
    )
    .with(
      {
        questionId: P.nonNullable,
      },
      (settings) => {
        const getStaticClickActionMode: ClickActionModeGetter = ({
          question,
        }: {
          question: Question;
        }) => {
          return (
            question &&
            getEmbeddingMode({
              question,
              queryMode: StaticQuestionSdkMode,
            })
          );
        };

        return (
          <SdkQuestion
            questionId={settings.questionId}
            withDownloads={settings.withDownloads}
            height="100%"
            initialSqlParameters={settings.initialSqlParameters}
            title={settings.withTitle}
            isSaveEnabled={false}
            key={rerenderKey}
            targetCollection={settings.targetCollection}
            entityTypes={settings.entityTypes}
            getClickActionMode={
              settings.drills ? undefined : getStaticClickActionMode
            }
          />
        );
      },
    )
    .otherwise(() => null);
};
