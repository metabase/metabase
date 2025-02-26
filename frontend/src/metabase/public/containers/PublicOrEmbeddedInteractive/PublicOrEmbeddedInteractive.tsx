import { useMemo } from "react";
import { P, match } from "ts-pattern";

// eslint-disable-next-line no-restricted-imports -- to fix after POC
import {
  InteractiveDashboard,
  InteractiveQuestion,
  defineMetabaseAuthConfig,
  defineMetabaseTheme,
} from "embedding-sdk";
import { IframeInteractiveEmbeddingProvider } from "metabase/embedding-sdk/components/IframeInteractiveEmbeddingProvider";
import {
  type InteractiveV2Settings,
  useInteractiveV2Settings,
} from "metabase/public/hooks/use-interactive-v2-settings";
import { Box } from "metabase/ui";

export const PublicOrEmbeddedInteractive = ({
  params: { settings: settingsKey },
}: {
  params: { settings: string };
}) => {
  const settings = useInteractiveV2Settings(settingsKey);
  const { theme } = settings ?? {};

  const authConfig = useMemo(() => {
    return defineMetabaseAuthConfig({
      metabaseInstanceUrl: window.location.origin,
      apiKey: settings?.apiKey ?? "",
    });
  }, [settings?.apiKey]);

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

  if (!settings) {
    return <div>Invalid settings!</div>;
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
