import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { EmbedServerSnippetLanguageSelect } from "metabase/public/components/EmbedServerSnippetLanguageSelect/EmbedServerSnippetLanguageSelect";
import { Button, Card, CopyButton, Flex, Icon, Stack, Text } from "metabase/ui";
import { useSdkIframeEmbedServerSnippet } from "metabase-enterprise/embedding_iframe_sdk_setup/hooks/use-sdk-iframe-embed-server-snippet";
import type { SettingKey } from "metabase-types/api";

import { trackEmbedWizardCodeCopied } from "../analytics";
import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedSnippet } from "../hooks/use-sdk-iframe-embed-snippet";

export const GetCodeStep = () => {
  const { settings } = useSdkIframeEmbedSetupContext();
  const [updateInstanceSettings] = useUpdateSettingsMutation();

  const serverSnippetData = useSdkIframeEmbedServerSnippet();
  const snippet = useSdkIframeEmbedSnippet();

  return (
    <Stack gap="md">
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
          </Stack>
        </Card>
      )}

      <Card p="md">
        <Text size="lg" fw="bold" mb="md">
          {t`Embed code`}
        </Text>

        <Stack gap="sm">
          <CodeEditor
            language="html"
            value={snippet}
            readOnly
            lineNumbers={false}
          />

          <CopyButton value={snippet}>
            {({ copied, copy }: { copied: boolean; copy: () => void }) => (
              <Button
                leftSection={<Icon name="copy" size={16} />}
                onClick={() => {
                  copy();
                  trackEmbedWizardCodeCopied();

                  // Embedding Hub: track step completion
                  const settingKey: SettingKey = settings.useExistingUserSession
                    ? "embedding-hub-test-embed-snippet-created"
                    : "embedding-hub-production-embed-snippet-created";

                  updateInstanceSettings({ [settingKey]: true });
                }}
              >
                {copied ? t`Copied!` : t`Copy code`}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Card>
    </Stack>
  );
};
