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
import { Code } from "metabase/ui";

export const PublicOrEmbeddedInteractive = ({
  params: { settings: settingsKey },
}: {
  params: { settings: string };
}) => {
  const settings = useInteractiveV2Settings(settingsKey);

  if (!settings) {
    return <div>Invalid settings!</div>;
  }

  const authConfig = defineMetabaseAuthConfig({
    metabaseInstanceUrl: window.location.origin,
    apiKey: settings.apiKey,
  });

  return (
    <IframeInteractiveEmbeddingProvider authConfig={authConfig}>
      <PublicOrEmbeddedInteractiveInner settings={settings} />

      <Code c="#2d2d30" px="md">
        {JSON.stringify(settings, null, 2)}
      </Code>
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
      <InteractiveDashboard dashboardId={id} />
    ))
    .with(["question", P.nonNullable], ([, id]) => (
      <InteractiveQuestion questionId={id} />
    ))
    .otherwise(() => null);
};
