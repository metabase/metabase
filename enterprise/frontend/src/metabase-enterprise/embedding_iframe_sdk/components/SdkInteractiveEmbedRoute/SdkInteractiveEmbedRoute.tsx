import { useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";

// eslint-disable-next-line no-restricted-imports -- to fix after POC
import {
  InteractiveDashboard,
  InteractiveQuestion,
  defineMetabaseAuthConfig,
  defineMetabaseTheme,
} from "embedding-sdk";
import {
  type IframeAuthConfig,
  authenticateWithIframe,
} from "embedding-sdk/store/auth/iframe";
import type { SdkInteractiveEmbedRouteProps } from "metabase/embedding-sdk/types/iframe-interactive-embedding";
import { Box, Center, Loader } from "metabase/ui";

import {
  type SdkInteractiveEmbedSettings,
  useSdkInteractiveEmbedSettings,
} from "../../hooks/useSdkInteractiveEmbedSettings";
import { SdkInteractiveEmbedProvider } from "../SdkInteractiveEmbedProvider";

export const SdkInteractiveEmbedRoute = ({
  params: { settings: settingsKey },
}: SdkInteractiveEmbedRouteProps) => {
  const [config, setConfig] = useState<IframeAuthConfig | null>(null);

  const settings = useSdkInteractiveEmbedSettings(settingsKey);
  const { theme } = settings ?? {};

  const authConfig = useMemo(() => {
    return defineMetabaseAuthConfig({
      metabaseInstanceUrl: window.location.origin,
      ...(config?.type === "apiKey" && { apiKey: config.apiKey }),
    });
  }, [config]);

  const derivedTheme = useMemo(() => {
    return defineMetabaseTheme({
      ...theme,
      colors: { ...theme?.colors },
      components: {
        question: {
          toolbar: { backgroundColor: theme?.colors?.background },
        },
        ...theme?.components,
      },
    });
  }, [theme]);

  useEffect(() => {
    const { promise, cleanup } = authenticateWithIframe();
    promise.then(setConfig);

    return cleanup;
  }, []);

  // TODO: improve error handling
  if (!settings) {
    return <div>Invalid settings!</div>;
  }

  const ready =
    (config?.type === "apiKey" && config.apiKey) || config?.type === "sso";

  if (!ready) {
    return (
      <Center h="100%" mih="100vh">
        <Loader mr="md" />
        <div>authenticating...</div>
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
