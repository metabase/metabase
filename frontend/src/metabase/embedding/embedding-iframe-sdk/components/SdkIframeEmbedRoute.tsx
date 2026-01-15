import { type ReactNode, useMemo } from "react";
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
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type { SdkDashboardEntityPublicProps } from "embedding-sdk-bundle/types/dashboard";
import type { SdkQuestionEntityPublicProps } from "embedding-sdk-bundle/types/question";
import { applyThemePreset } from "embedding-sdk-shared/lib/apply-theme-preset";
import { EmbeddingFooter } from "metabase/embedding/components/EmbeddingFooter/EmbeddingFooter";
import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";
import { createTracker } from "metabase/lib/analytics-untyped";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { Stack } from "metabase/ui";

import { useParamRerenderKey } from "../hooks/use-param-rerender-key";
import { useSdkIframeEmbedEventBus } from "../hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "../types/embed";

import { MetabaseBrowser } from "./MetabaseBrowser";
import SdkIframeEmbedRouteS from "./SdkIframeEmbedRoute.module.css";
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

  const adjustedTheme = useMemo(
    () => applyThemePreset(embedSettings?.theme),
    [embedSettings?.theme],
  );

  // The embed settings won't be available until the parent sends it via postMessage.
  // The SDK will show its own loading indicator, so we don't need to show it twice.
  if (!embedSettings || !embedSettings.instanceUrl) {
    return null;
  }

  const hasEmbedTokenFeature = PLUGIN_EMBEDDING_IFRAME_SDK.isEnabled();

  const { isGuest, locale } = embedSettings;
  const isProduction = !embedSettings._isLocalhost;

  // If the parent page is not running on localhost, it's not the unauthenticated embedding, and
  // the token feature is not present, we show an error message
  if (isProduction && !isGuest && !hasEmbedTokenFeature) {
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

  const authConfig = {
    isGuest: embedSettings.isGuest,
    metabaseInstanceUrl: embedSettings.instanceUrl,
    apiKey: embedSettings.apiKey,
  } as MetabaseAuthConfig;

  return (
    <ComponentProvider
      authConfig={authConfig}
      theme={adjustedTheme}
      locale={locale}
      reduxStore={store}
      isLocalHost={embedSettings._isLocalhost}
    >
      <Stack
        mih="100vh"
        className={SdkIframeEmbedRouteS.Container}
        style={{
          backgroundColor: adjustedTheme?.colors?.background,
        }}
      >
        <SdkIframeEmbedView settings={embedSettings} />

        {isGuest && <EmbedBrandingFooter />}
      </Stack>
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
        // Embedding based on a dashboardId (Metabase Account auth type) with disabled drills
        {
          componentName: "metabase-dashboard",
          dashboardId: P.nonNullable,
          drills: false,
        },
        // Embedding based on a token (Guest Embed auth type) with default/disabled drills
        {
          componentName: "metabase-dashboard",
          token: P.nonNullable,
        },
        (settings) => {
          const entityProps: SdkDashboardEntityPublicProps = settings.token
            ? {
                token: settings.token,
              }
            : {
                dashboardId: settings.dashboardId ?? null,
              };

          return (
            <StaticDashboard
              key={rerenderKey}
              className={SdkIframeEmbedRouteS.Dashboard}
              {...entityProps}
              withTitle={settings.withTitle}
              withDownloads={settings.withDownloads}
              initialParameters={settings.initialParameters}
              hiddenParameters={settings.hiddenParameters}
            />
          );
        },
      )
      .with(
        // Embedding based on a dashboardId (Metabase Account auth type) with default/enabled drills
        {
          componentName: "metabase-dashboard",
          dashboardId: P.nonNullable,
          drills: P.optional(true),
        },
        (settings) => (
          <InteractiveDashboard
            key={rerenderKey}
            className={SdkIframeEmbedRouteS.Dashboard}
            dashboardId={settings.dashboardId ?? null}
            token={settings.token}
            withTitle={settings.withTitle}
            withDownloads={settings.withDownloads}
            withSubscriptions={settings.withSubscriptions}
            initialParameters={settings.initialParameters}
            hiddenParameters={settings.hiddenParameters}
            drillThroughQuestionHeight="100%"
            drillThroughQuestionProps={{ isSaveEnabled: false }}
          />
        ),
      )
      .with(
        // Embedding based on a questionId (Metabase Account auth type) with disabled drills
        {
          componentName: "metabase-question",
          questionId: P.intersection(P.nonNullable, P.not("new")),
          drills: false,
        },
        // Embedding based on a token (Guest Embed auth type) with default/disabled drills
        {
          componentName: "metabase-question",
          token: P.nonNullable,
        },
        (settings) => {
          const entityProps: SdkQuestionEntityPublicProps = settings.token
            ? {
                token: settings.token,
              }
            : {
                questionId: settings.questionId ?? null,
              };

          return (
            <StaticQuestion
              key={rerenderKey}
              {...entityProps}
              withDownloads={settings.withDownloads}
              height="100%"
              initialSqlParameters={settings.initialSqlParameters}
              hiddenParameters={settings.hiddenParameters}
              title={settings.withTitle ?? true}
            />
          );
        },
      )
      // Guest Embed of a question
      .with(
        // Embedding based on a questionId (Metabase Account auth type) with default/enabled drills
        {
          componentName: "metabase-question",
          questionId: P.nonNullable,
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
          <MetabotQuestion
            key={rerenderKey}
            layout={settings.layout}
            height="100%"
          />
        ),
      )
      .otherwise(() => null)
  );
};

const EmbedBrandingFooter = () => {
  const hasEmbedBranding = useSelector(
    (state) => !getSetting(state, "hide-embed-branding?"),
  );

  if (!hasEmbedBranding) {
    return null;
  }

  return (
    <PublicComponentStylesWrapper
      className={SdkIframeEmbedRouteS.BrandingFooter}
    >
      <EmbeddingFooter variant="default" hasEmbedBranding />
    </PublicComponentStylesWrapper>
  );
};
