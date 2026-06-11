import { useUpdateSettingsMutation } from "metabase/api";
import { Stack } from "metabase/ui";
import type { SettingKey } from "metabase-types/api";

import { trackEmbedWizardCodeCopied } from "../../../analytics";
import { useSdkIframeEmbedSetupContext } from "../../../context";
import { useSdkIframeEmbedServerSnippet } from "../../../hooks/use-sdk-iframe-embed-server-snippet";
import { useSdkIframeEmbedSnippet } from "../../../hooks/use-sdk-iframe-embed-snippet";
import { PublishQuestionEmptyState } from "../../GetCode/PublishQuestionEmptyState";

import { EmbedCodeCard } from "./EmbedCodeCard";
import { MetabaseAccountCard } from "./MetabaseAccountCard";
import { ServerCodeCard } from "./ServerCodeCard";

export const GetCodeStep = () => {
  const { experience, resource, settings } = useSdkIframeEmbedSetupContext();
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

    // Embedding Hub: track step completion
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

  return (
    <Stack gap="md" flex={1}>
      {!isGuestEmbed && <MetabaseAccountCard />}

      {showCode ? (
        <>
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
        </>
      ) : (
        <PublishQuestionEmptyState />
      )}
    </Stack>
  );
};
