import { useMemo } from "react";
import { P, match } from "ts-pattern";

// eslint-disable-next-line no-restricted-imports -- to fix after POC
import { InteractiveDashboard, defineMetabaseAuthConfig } from "embedding-sdk";
import { IframeInteractiveEmbeddingProvider } from "metabase/embedding-sdk/components/IframeInteractiveEmbeddingProvider";
import { useInteractiveV2Settings } from "metabase/public/hooks/use-interactive-v2-settings";

export const PublicOrEmbeddedInteractive = ({
  params: { settings: settingsKey },
}: {
  params: { settings: string };
}) => {
  const settings = useInteractiveV2Settings(settingsKey);

  const content = useMemo(
    () =>
      match(settings?.embedResourceType)
        .with("dashboard", () => <InteractiveDashboard dashboardId={2} />)
        .with("question", () => <div>Question</div>)
        .with(P.nullish, () => null)
        .exhaustive(),
    [settings],
  );

  if (!settings) {
    return <div>Invalid settings!</div>;
  }
  const authConfig = defineMetabaseAuthConfig({
    metabaseInstanceUrl: window.location.href,
    apiKey: settings.apiKey,
  });

  return (
    <IframeInteractiveEmbeddingProvider authConfig={authConfig}>
      {content}
    </IframeInteractiveEmbeddingProvider>
  );
};
