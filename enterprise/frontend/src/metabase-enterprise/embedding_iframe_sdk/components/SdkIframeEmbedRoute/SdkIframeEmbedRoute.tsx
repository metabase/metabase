import { useMemo } from "react";
import { P, match } from "ts-pattern";

// eslint-disable-next-line no-restricted-imports -- to fix after POC
import {
  InteractiveDashboard,
  InteractiveQuestion,
  defineMetabaseAuthConfig,
  defineMetabaseTheme,
} from "embedding-sdk";
import { Box, Center, Loader } from "metabase/ui";

import { useSdkIframeEmbedEventBus } from "../../hooks/use-sdk-interactive-embed-event";
import type { SdkIframeEmbedSettings } from "../../types/iframe";
import { SdkIframeEmbedProvider } from "../SdkIframeEmbedProvider";

export const SdkIframeEmbedRoute = () => {
  const { iframeAuthConfig, iframeSettings } = useSdkIframeEmbedEventBus();

  const authConfig = useMemo(() => {
    if (!iframeAuthConfig) {
      return;
    }

    // TODO: to be implemented once the new SSO implementation on the SDK is ready
    if (iframeAuthConfig.type === "sso") {
      console.error("SSO authentication is not supported yet");
      return;
    }

    return defineMetabaseAuthConfig({
      metabaseInstanceUrl: window.location.origin,
      apiKey: iframeAuthConfig.apiKey,
    });
  }, [iframeAuthConfig]);

  const isAuthReady =
    iframeAuthConfig?.type === "apiKey" && iframeAuthConfig.apiKey;

  const { theme } = iframeSettings ?? {};

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
  if (!iframeSettings) {
    return <div>Invalid settings!</div>;
  }

  if (!isAuthReady || !authConfig) {
    return (
      <Center h="100%" mih="100vh">
        <Loader />
      </Center>
    );
  }

  return (
    <SdkIframeEmbedProvider authConfig={authConfig} theme={derivedTheme}>
      <Box h="100vh" bg={theme?.colors?.background}>
        <SdkIframeEmbedView settings={iframeSettings} />
      </Box>
    </SdkIframeEmbedProvider>
  );
};

export const SdkIframeEmbedView = ({
  settings,
}: {
  settings: SdkIframeEmbedSettings;
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
