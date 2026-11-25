import { useUpdateSettingsMutation } from "metabase/settings";
import { Stack } from "metabase/ui";
import type { SettingKey } from "metabase-types/api";

import { trackEmbedWizardCodeCopied } from "../../../analytics";
import { useSdkIframeEmbedSetupContext } from "../../../context";
import { DataAppEnableEmbeddingCard } from "../../../data-apps/DataAppEnableEmbeddingCard";
import { useSdkIframeEmbedServerSnippet } from "../../../hooks/use-sdk-iframe-embed-server-snippet";
import { useSdkIframeEmbedSnippet } from "../../../hooks/use-sdk-iframe-embed-snippet";
import { SetupSsoAlert } from "../../Common/SetupSsoAlert";
import { PublishQuestionEmptyState } from "../../GetCode/PublishQuestionEmptyState";

import { EmbedCodeCard } from "./EmbedCodeCard";
import { MetabaseAccountCard } from "./MetabaseAccountCard";
import { ServerCodeCard } from "./ServerCodeCard";

export const GetCodeStep = () => {
  const {
    allowPreviewAndNavigation,
    experience,
    isFirstStep,
    isSsoEnabledAndConfigured,
    resource,
    settings,
  } = useSdkIframeEmbedSetupContext();
  const [updateInstanceSettings] = useUpdateSettingsMutation();

  const isGuestEmbed = !!settings.isGuest;

  const serverSnippetData = useSdkIframeEmbedServerSnippet();
  const snippet = useSdkIframeEmbedSnippet();

  const trackSnippetCopied = (snippetType: "frontend" | "server") => {
    trackEmbedWizardCodeCopied({
      experience,
      resource,
      snippetType,
      settings,
    });
  };

  const handleFrontendSnippetCopied = () => {
    trackSnippetCopied("frontend");

    // Setup guide: track step completion. The settings keep their embedding-hub names.
    // Test embed = guest or existing user session (for quick testing)
    // Production embed = full SSO setup
    const isTestEmbed = settings.isGuest || settings.useExistingUserSession;

    const settingKey: SettingKey = isTestEmbed
      ? "embedding-hub-test-embed-snippet-created"
      : "embedding-hub-production-embed-snippet-created";

    updateInstanceSettings({ [settingKey]: true });
  };

  const handleServerSnippetCopied = () => trackSnippetCopied("server");

  const showCode = !isGuestEmbed || resource?.enable_embedding;

  // Embedding a data app from Data Studio starts on this step, so it must
  // show the setup the experience step would otherwise show for data apps.
  const showDataAppSetup = experience === "data-app" && isFirstStep;

  // `inert` keeps the code from being focused, selected, or copied with the
  // keyboard until embedding is enabled, not just from being clicked.
  const isDimmed = showDataAppSetup && !allowPreviewAndNavigation;
  const dimmedProps = {
    opacity: isDimmed ? 0.5 : 1,
    inert: isDimmed,
  };

  return (
    <Stack gap="lg" flex={1}>
      {showDataAppSetup && (
        <DataAppEnableEmbeddingCard
          alert={
            !isSsoEnabledAndConfigured && <SetupSsoAlert variant="data-app" />
          }
        />
      )}

      {!isGuestEmbed && experience !== "data-app" && <MetabaseAccountCard />}

      {showCode ? (
        <Stack gap="lg" data-testid="embed-code-section" {...dimmedProps}>
          <EmbedCodeCard
            snippet={snippet}
            onCopy={handleFrontendSnippetCopied}
          />

          {!!serverSnippetData && (
            <ServerCodeCard
              serverSnippetData={serverSnippetData}
              onCopy={handleServerSnippetCopied}
            />
          )}
        </Stack>
      ) : (
        <PublishQuestionEmptyState />
      )}
    </Stack>
  );
};
