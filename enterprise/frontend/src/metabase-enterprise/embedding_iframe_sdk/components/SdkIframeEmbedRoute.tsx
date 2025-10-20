import type { ReactNode } from "react";
import { P, match } from "ts-pattern";

import { PublicComponentStylesWrapper } from "embedding-sdk-bundle/components/private/PublicComponentStylesWrapper";
import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkBreadcrumbsProvider } from "embedding-sdk-bundle/components/private/SdkBreadcrumbs";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { MetabotQuestion } from "embedding-sdk-bundle/components/public/MetabotQuestion";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion";
import {
  InteractiveDashboard,
  StaticDashboard,
} from "embedding-sdk-bundle/components/public/dashboard";
import { getSdkStore, useSdkSelector } from "embedding-sdk-bundle/store";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import type { MetabaseAuthConfig } from "embedding-sdk-package";
import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";
import { createTracker } from "metabase/lib/analytics-untyped";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { Box } from "metabase/ui";

import { useParamRerenderKey } from "../hooks/use-param-rerender-key";
import { useSdkIframeEmbedEventBus } from "../hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "../types/embed";

import { MetabaseBrowser } from "./MetabaseBrowser";
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

const store = getSdkStore();
createTracker(store);

export const SdkIframeEmbedRoute = () => {
  const { embedSettings } = useSdkIframeEmbedEventBus({
    onSettingsChanged,
  });

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

  const { isStatic, theme, locale } = embedSettings;

  const authConfig = {
    metabaseInstanceUrl: embedSettings.instanceUrl,
    apiKey: embedSettings.apiKey,
  } as MetabaseAuthConfig;

  return (
    <ComponentProvider
      isStatic={isStatic}
      authConfig={authConfig}
      theme={theme}
      locale={locale}
      reduxStore={store}
    >
      <Box h="100vh" bg={theme?.colors?.background}>
        <SdkIframeEmbedView settings={embedSettings} />
      </Box>
    </ComponentProvider>
  );
};

const SdkIframeEmbedView = ({
  settings,
}: {
  settings: SdkIframeEmbedSettings;
}): ReactNode => {
  const rerenderKey = useParamRerenderKey(settings);
  const loginStatus = useSdkSelector(getLoginStatus);

  if (loginStatus?.status === "error") {
    return (
      <PublicComponentStylesWrapper>
        <SdkError
          error={loginStatus.error}
          message={loginStatus.error.message}
        />
      </PublicComponentStylesWrapper>
    );
  }

  return (
    match(settings)
      .with(
        {
          componentName: "metabase-browser",
        },
        (settings) => (
          // re-mount breadcrumbs when initial collection changes
          <SdkBreadcrumbsProvider key={settings.initialCollection}>
            <MetabaseBrowser settings={settings} />
          </SdkBreadcrumbsProvider>
        ),
      )
      .with(
        // Embedding based on a dashboardId (non-anonymous) with disabled drills
        {
          componentName: "metabase-dashboard",
          dashboardId: P.nonNullable,
          drills: false,
        },
        // Embedding based on a token (anonymous) with default/disabled drills
        {
          componentName: "metabase-dashboard",
          token: P.nonNullable,
          drills: P.optional(false),
        },
        (settings) => (
          <StaticDashboard
            dashboardId={settings.dashboardId ?? null}
            token={settings.token}
            withTitle={settings.withTitle}
            withDownloads={settings.withDownloads}
            initialParameters={settings.initialParameters}
            hiddenParameters={settings.hiddenParameters}
            key={rerenderKey}
          />
        ),
      )
      .with(
        // Embedding based on a questionId (non-anonymous) with default/enabled drills
        {
          componentName: "metabase-dashboard",
          dashboardId: P.nonNullable,
          drills: P.optional(true),
        },
        // Embedding based on a token (anonymous) with enabled drills
        {
          componentName: "metabase-dashboard",
          token: P.nonNullable,
          drills: true,
        },
        (settings) => (
          <InteractiveDashboard
            dashboardId={settings.dashboardId ?? null}
            token={settings.token}
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
        // Embedding based on a questionId (non-anonymous) with disabled drills
        {
          componentName: "metabase-question",
          questionId: P.nonNullable,
          drills: false,
        },
        // Embedding based on a token (anonymous) with default/disabled drills
        {
          componentName: "metabase-question",
          token: P.nonNullable,
          drills: P.optional(false),
        },
        (settings) => (
          <StaticQuestion
            key={rerenderKey}
            questionId={settings.questionId ?? null}
            token={settings.token}
            withDownloads={settings.withDownloads}
            height="100%"
            initialSqlParameters={settings.initialSqlParameters}
            hiddenParameters={settings.hiddenParameters}
            title={settings.withTitle ?? true}
          />
        ),
      )
      // Anonymous embedding for question
      .with(
        // Embedding based on a questionId (non-anonymous) with default/enabled drills
        {
          componentName: "metabase-question",
          questionId: P.nonNullable,
          drills: P.optional(true),
        },
        // Embedding based on a token (anonymous) with enabled drills
        {
          componentName: "metabase-question",
          token: P.nonNullable,
          drills: true,
        },
        (settings) => (
          <SdkQuestion
            key={rerenderKey}
            questionId={settings.questionId ?? null}
            token={settings.token}
            withDownloads={settings.withDownloads}
            height="100%"
            initialSqlParameters={settings.initialSqlParameters}
            hiddenParameters={settings.hiddenParameters}
            title={settings.withTitle ?? true}
            isSaveEnabled={settings.isSaveEnabled ?? false}
            targetCollection={settings.targetCollection}
            entityTypes={settings.entityTypes}
          />
        ),
      )
      .with(
        {
          componentName: "metabase-metabot",
        },
        (settings) => (
          <MetabotQuestion layout={settings.layout} height="100%" />
        ),
      )
      .otherwise(() => null)
  );
};
