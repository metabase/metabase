import { useMemo } from "react";
import { P, match } from "ts-pattern";

import {
  InteractiveDashboard,
  InteractiveQuestion,
  defineMetabaseAuthConfig,
} from "embedding-sdk";
import { MetabaseProvider } from "embedding-sdk/components/public/MetabaseProvider";
import { Box, Center, Loader, ThemeProvider } from "metabase/ui";

import { useSdkIframeEmbedEventBus } from "../hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "../types/embed";

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

  if (embedSettings === null || !authConfig) {
    return (
      <ThemeProvider>
        <Center h="100%" mih="100vh">
          <Loader />
        </Center>
      </ThemeProvider>
    );
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
