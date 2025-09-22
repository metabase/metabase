import { type ReactNode, useEffect } from "react";
import { P, match } from "ts-pattern";

import { PublicComponentStylesWrapper } from "embedding-sdk-bundle/components/private/PublicComponentStylesWrapper";
import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkBreadcrumbsProvider } from "embedding-sdk-bundle/components/private/SdkBreadcrumbs";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion";
import {
  InteractiveDashboard,
  StaticDashboard,
} from "embedding-sdk-bundle/components/public/dashboard";
import { getSdkStore, useSdkSelector } from "embedding-sdk-bundle/store";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import type { MetabaseAuthConfig } from "embedding-sdk-package";
import { useSetting } from "metabase/common/hooks";
import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";
import { trackSchemaEvent } from "metabase/lib/analytics";
import { createTracker } from "metabase/lib/analytics-untyped";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { Box } from "metabase/ui";
import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";

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
  const { embedSettings, usageAnalytics } = useSdkIframeEmbedEventBus({
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

  const { theme, locale } = embedSettings;

  const authConfig: MetabaseAuthConfig = {
    metabaseInstanceUrl: embedSettings.instanceUrl,
    apiKey: embedSettings.apiKey,
  };

  return (
    <ComponentProvider
      authConfig={authConfig}
      theme={theme}
      locale={locale}
      reduxStore={store}
    >
      <Box h="100vh" bg={theme?.colors?.background}>
        <SdkIframeEmbedView settings={embedSettings} />
        <AnalyticsReporter usageAnalytics={usageAnalytics} />
      </Box>
    </ComponentProvider>
  );
};

interface AnalyticsReporterProps {
  usageAnalytics: {
    usage: EmbeddedAnalyticsJsEventSchema;
    embedHostUrl: string;
  } | null;
}
function AnalyticsReporter({ usageAnalytics }: AnalyticsReporterProps) {
  const instanceUrl = useSetting("site-url");
  useEffect(() => {
    const isEmbeddedAnalyticsJsPreview =
      usageAnalytics && usageAnalytics.embedHostUrl?.startsWith(instanceUrl);
    if (usageAnalytics && !isEmbeddedAnalyticsJsPreview) {
      trackSchemaEvent("embedded_analytics_js", usageAnalytics.usage);
    }
  }, [instanceUrl, usageAnalytics]);

  return null;
}

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

  return match(settings)
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
      {
        componentName: "metabase-dashboard",
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
        componentName: "metabase-dashboard",
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
        componentName: "metabase-question",
        questionId: P.nonNullable,
      },
      (settings) => {
        const commonProps = {
          questionId: settings.questionId,
          withDownloads: settings.withDownloads,
          height: "100%",
          initialSqlParameters: settings.initialSqlParameters,
          title: settings.withTitle ?? true, // defaulting title to true even if in the sdk it defaults to false for static
        };

        // note: to create a new question we need to render InteractiveQuestion
        if (settings.drills === false && settings.questionId !== "new") {
          // note: this disable drills but also removes the top toolbar
          return <StaticQuestion {...commonProps} key={rerenderKey} />;
        }

        return (
          <SdkQuestion
            {...commonProps}
            isSaveEnabled={settings.isSaveEnabled ?? false}
            key={rerenderKey}
            targetCollection={settings.targetCollection}
            entityTypes={settings.entityTypes}
          />
        );
      },
    )
    .otherwise(() => null);
};
