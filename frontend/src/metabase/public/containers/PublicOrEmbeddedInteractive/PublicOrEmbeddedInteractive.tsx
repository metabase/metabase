import { useMemo } from "react";
import { P, match } from "ts-pattern";

// eslint-disable-next-line no-restricted-imports -- to fix after POC
import {
  InteractiveDashboard,
  InteractiveQuestion,
  defineMetabaseAuthConfig,
} from "embedding-sdk";
import { IframeInteractiveEmbeddingProvider } from "metabase/embedding-sdk/components/IframeInteractiveEmbeddingProvider";
import {
  type InteractiveV2Settings,
  useInteractiveV2Settings,
} from "metabase/public/hooks/use-interactive-v2-settings";

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

  if (!settings) {
    return <div>Invalid settings!</div>;
  }

  return (
    <IframeInteractiveEmbeddingProvider authConfig={authConfig} theme={theme}>
      <PublicOrEmbeddedInteractiveInner settings={settings} />
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
      <InteractiveQuestion questionId={id} height="100vh" />
    ))
    .otherwise(() => null);
};
