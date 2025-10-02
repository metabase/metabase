import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { Button, Card, CopyButton, Icon, Stack, Text } from "metabase/ui";
import type { SettingKey } from "metabase-types/api";

import { trackEmbedWizardCodeCopied } from "../analytics";
import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedSnippet } from "../hooks/use-sdk-iframe-embed-snippet";

export const GetCodeStep = () => {
  const { settings } = useSdkIframeEmbedSetupContext();
  const [updateInstanceSettings] = useUpdateSettingsMutation();

  const snippet = useSdkIframeEmbedSnippet();

  return (
    <Stack gap="md">
      <Card p="md">
        <Text size="lg" fw="bold" mb="md">
          {t`Embed Code`}
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
                {copied ? t`Copied!` : t`Copy Code`}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Card>
    </Stack>
  );
};
