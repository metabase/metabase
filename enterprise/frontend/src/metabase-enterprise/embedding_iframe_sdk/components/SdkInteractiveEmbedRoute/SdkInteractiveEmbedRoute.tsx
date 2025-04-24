import { useMemo } from "react";
import { P, match } from "ts-pattern";

// eslint-disable-next-line no-restricted-imports -- to fix after POC
import {
  InteractiveDashboard,
  InteractiveQuestion,
  defineMetabaseAuthConfig,
  defineMetabaseTheme,
} from "embedding-sdk";
import type { SdkInteractiveEmbedRouteProps } from "metabase/embedding-sdk/types/iframe-interactive-embedding";
import { Box, Center, Loader } from "metabase/ui";
import { useSdkInteractiveEmbedAuth } from "metabase-enterprise/embedding_iframe_sdk/hooks/use-sdk-interactive-embed-auth";

import {
  type SdkInteractiveEmbedSettings,
  useSdkInteractiveEmbedSettings,
} from "../../hooks/use-sdk-interactive-embed-settings";
import { SdkInteractiveEmbedProvider } from "../SdkInteractiveEmbedProvider";

export const SdkInteractiveEmbedRoute = ({
  params: { settings: settingsKey },
}: SdkInteractiveEmbedRouteProps) => {
  const { iframeAuthConfig } = useSdkInteractiveEmbedAuth();

  const settings = useSdkInteractiveEmbedSettings(settingsKey);
  const { theme } = settings ?? {};

  const authConfig = useMemo(() => {
    // TODO: to be implemented once the new SSO implementation on the SDK is ready
    if (!iframeAuthConfig || iframeAuthConfig.type === "sso") {
      throw new Error("authentication scheme is not supported");
    }

    return defineMetabaseAuthConfig({
      metabaseInstanceUrl: window.location.origin,
      apiKey: iframeAuthConfig.apiKey,
    });
  }, [iframeAuthConfig]);

  const isAuthReady =
    iframeAuthConfig?.type === "apiKey" && iframeAuthConfig.apiKey;

  const derivedTheme = useMemo(() => {
    return defineMetabaseTheme({
      ...theme,
      colors: { ...theme?.colors },
      components: {
        question: { toolbar: { backgroundColor: theme?.colors?.background } },
        ...theme?.components,
      },
    });
  }, [theme]);

  // TODO: improve error handling
  if (!settings) {
    return <div>Invalid settings!</div>;
  }

  if (!isAuthReady) {
    return (
      <Center h="100%" mih="100vh">
        <Loader />
      </Center>
    );
  }

  return (
    <SdkInteractiveEmbedProvider authConfig={authConfig} theme={derivedTheme}>
      <Box h="100vh" bg={theme?.colors?.background}>
        <PublicOrEmbeddedInteractiveInner settings={settings} />
      </Box>
    </SdkInteractiveEmbedProvider>
  );
};

export const PublicOrEmbeddedInteractiveInner = ({
  settings,
}: {
  settings: SdkInteractiveEmbedSettings;
}) => {
  const { embedResourceType, embedResourceId } = settings;

  return match([embedResourceType, embedResourceId])
    .with(["dashboard", P.nonNullable], ([, id]) => (
      <InteractiveDashboard dashboardId={id} drillThroughQuestionHeight={800} />
    ))
    .with(["question", P.nonNullable], ([, id]) => (
      <InteractiveQuestion questionId={id} height="100%" />
    ))
    .otherwise(() => null);
};
