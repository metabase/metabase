import { useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";

// eslint-disable-next-line no-restricted-imports -- to fix after POC
import {
  InteractiveDashboard,
  InteractiveQuestion,
  defineMetabaseAuthConfig,
  defineMetabaseTheme,
} from "embedding-sdk";
import type { SdkInteractiveEmbedRouteProps } from "metabase/embedding-sdk/types/iframe-interactive-embedding";
import { isWithinIframe } from "metabase/lib/dom";
import { Box, Center, Loader } from "metabase/ui";

import {
  type SdkInteractiveEmbedSettings,
  useSdkInteractiveEmbedSettings,
} from "../../hooks/useSdkInteractiveEmbedSettings";
import { SdkInteractiveEmbedProvider } from "../SdkInteractiveEmbedProvider";

type SimpleInteractivePostMessageAction = {
  type: "metabase.embed.authenticate";
  payload: { apiKey: string };
};

export const SdkInteractiveEmbedRoute = ({
  params: { settings: settingsKey },
}: SdkInteractiveEmbedRouteProps) => {
  const [apiKey, setApiKey] = useState("");

  const settings = useSdkInteractiveEmbedSettings(settingsKey);
  const { theme } = settings ?? {};

  const authConfig = useMemo(() => {
    return defineMetabaseAuthConfig({
      metabaseInstanceUrl: window.location.origin,
      apiKey,
    });
  }, [apiKey]);

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
    if (isWithinIframe()) {
      // Send a message to the parent to indicate that the embed is waiting for authentication
      window.parent.postMessage({ type: "metabase.embed.waitingForAuth" }, "*");

      // TODO: verify the sender's origin for security
      const receiveMessage = (event: MessageEvent) => {
        const action: SimpleInteractivePostMessageAction | null = event.data;

        if (!action) {
          return;
        }

        // If the message is an authentication request, set the API key.
        // TODO: use a more secure method of authentication than API keys.
        if (action.type === "metabase.embed.authenticate") {
          setApiKey(action.payload.apiKey);
        }
      };

      window.addEventListener("message", receiveMessage);

      return () => {
        window.removeEventListener("message", receiveMessage);
      };
    }
  }, []);

  // TODO: improve error handling
  if (!settings) {
    return <div>Invalid settings!</div>;
  }

  if (!apiKey) {
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
