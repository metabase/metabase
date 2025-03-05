import { useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";

// eslint-disable-next-line no-restricted-imports -- to fix after POC
import {
  InteractiveDashboard,
  InteractiveQuestion,
  defineMetabaseAuthConfig,
  defineMetabaseTheme,
} from "embedding-sdk";
import { IframeInteractiveEmbeddingProvider } from "metabase/embedding-sdk/components/IframeInteractiveEmbeddingProvider";
import { isWithinIframe } from "metabase/lib/dom";
import {
  type InteractiveV2Settings,
  useInteractiveV2Settings,
} from "metabase/public/hooks/use-interactive-v2-settings";
import { Box, Center, Loader } from "metabase/ui";

type SimpleInteractivePostMessageAction = {
  type: "metabase.embed.authenticate";
  payload: { apiKey: string };
};

export const PublicOrEmbeddedInteractive = ({
  params: { settings: settingsKey },
}: {
  params: { settings: string };
}) => {
  const [apiKey, setApiKey] = useState("");

  const settings = useInteractiveV2Settings(settingsKey);
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
      colors: {
        ...theme?.colors,
      },
      components: {
        question: {
          toolbar: {
            backgroundColor: theme?.colors?.background,
          },
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
    <IframeInteractiveEmbeddingProvider
      authConfig={authConfig}
      theme={derivedTheme}
    >
      <Box h="100vh" bg={theme?.colors?.background}>
        <PublicOrEmbeddedInteractiveInner settings={settings} />
      </Box>
    </IframeInteractiveEmbeddingProvider>
  );
};

export const PublicOrEmbeddedInteractiveInner = ({
  settings,
}: {
  settings: InteractiveV2Settings;
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
