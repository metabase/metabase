import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { MoreServerSnippetExamplesLink } from "metabase/embedding/components/MoreServerSnippetExamplesLink/MoreServerSnippetExamplesLink";
import { MetabaseAccountSection } from "metabase/embedding/embedding-iframe-sdk-setup/components/Authentication/MetabaseAccountSection";
import { CopyCodeSnippetButton } from "metabase/embedding/embedding-iframe-sdk-setup/components/GetCode/CopyCodeSnippetButton";
import { PublishQuestionEmptyState } from "metabase/embedding/embedding-iframe-sdk-setup/components/GetCode/PublishQuestionEmptyState";
import { useSdkIframeEmbedServerSnippet } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-sdk-iframe-embed-server-snippet";
import { EmbedServerSnippetLanguageSelect } from "metabase/public/components/EmbedServerSnippetLanguageSelect/EmbedServerSnippetLanguageSelect";
import { Card, Flex, Stack, Text } from "metabase/ui";
import type { SettingKey } from "metabase-types/api";

import { trackEmbedWizardCodeCopied } from "../analytics";
import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedSnippet } from "../hooks/use-sdk-iframe-embed-snippet";

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
    const settingKey: SettingKey = settings.useExistingUserSession
      ? "embedding-hub-test-embed-snippet-created"
      : "embedding-hub-production-embed-snippet-created";

    updateInstanceSettings({ [settingKey]: true });
  };

  const handleServerSnippetCopied = () => trackSnippetCopied("server");

  return (
    <Stack gap="md" flex={1}>
      {!isGuestEmbed && <MetabaseAccountSection />}

      {!isGuestEmbed || resource?.enable_embedding ? (
        <>
          <Card p="md">
            <Text size="lg" fw="bold" mb="md">
              {t`Embed code`}
            </Text>

            <Stack gap="sm">
              <div onCopy={handleFrontendSnippetCopied}>
                <CodeEditor
                  language="html"
                  value={snippet}
                  readOnly
                  lineNumbers={false}
                />
              </div>

              <CopyCodeSnippetButton
                snippet={snippet}
                onCopy={handleFrontendSnippetCopied}
              />
            </Stack>
          </Card>

          {!!serverSnippetData && (
            <Card p="md">
              <Flex align="baseline" justify="space-between">
                <Text size="lg" fw="bold" mb="md">
                  {t`Server code`}
                </Text>

                <EmbedServerSnippetLanguageSelect
                  languageOptions={serverSnippetData.serverSnippetOptions}
                  selectedOptionId={serverSnippetData.selectedServerSnippetId}
                  onChangeOption={serverSnippetData.setSelectedServerSnippetId}
                />
              </Flex>

              <Stack gap="sm">
                <CodeEditor
                  language={serverSnippetData.serverSnippetOption.language}
                  value={serverSnippetData.serverSnippetOption.source}
                  readOnly
                  lineNumbers={false}
                />

                <CopyCodeSnippetButton
                  snippet={serverSnippetData.serverSnippetOption.source}
                  onCopy={handleServerSnippetCopied}
                />

                <MoreServerSnippetExamplesLink />
              </Stack>
            </Card>
          )}
        </>
      ) : (
        <PublishQuestionEmptyState />
      )}
    </Stack>
  );
};
