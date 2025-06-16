import { useDisclosure } from "@mantine/hooks";
import { c, t } from "ttag";

import { CreateApiKeyModal } from "metabase/admin/settings/components/ApiKeys/CreateApiKeyModal";
import {
  ActionIcon,
  Anchor,
  Button,
  Card,
  Code,
  CopyButton,
  Icon,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";

import { API_KEY_PLACEHOLDER } from "../constants";
import { useSdkIframeEmbedSnippet } from "../hooks/use-sdk-iframe-embed-snippet";

import { useSdkIframeEmbedSetupContext } from "./SdkIframeEmbedSetupContext";

export const GetCodeStep = () => {
  const snippet = useSdkIframeEmbedSnippet();
  const { settings, updateSettings } = useSdkIframeEmbedSetupContext();

  const [
    isCreateApiKeyModalOpen,
    { open: openCreateApiKeyModal, close: closeCreateApiKeyModal },
  ] = useDisclosure(false);

  return (
    <Stack gap="md">
      <Card p="md">
        <Stack gap="md">
          <Text size="lg" fw="bold">
            {t`Authentication`}
          </Text>

          <Text size="sm" c="text-medium">
            {/* eslint-disable-next-line no-literal-metabase-strings -- this is a message for admins */}
            {c(`{0} is a button to create an api key`)
              .jt`Enter an existing API key or ${(
              <Anchor
                component="span"
                size="sm"
                onClick={openCreateApiKeyModal}
              >
                {t`create one`}
              </Anchor>
            )}. API keys are only usable for local development. In production, you must use SSO authentication with sandboxing to prevent unwanted access.`}
          </Text>

          <TextInput
            label={t`API Key`}
            value={settings.apiKey}
            placeholder={API_KEY_PLACEHOLDER}
            onChange={(e) => updateSettings({ apiKey: e.target.value })}
            rightSection={
              <Tooltip label={t`Create API key`}>
                <ActionIcon onClick={openCreateApiKeyModal} variant="subtle">
                  <Icon name="key" size={16} />
                </ActionIcon>
              </Tooltip>
            }
          />
        </Stack>
      </Card>

      <Card p="md">
        <Text size="lg" fw="bold" mb="md">
          {t`Embed Code`}
        </Text>

        <Stack gap="sm">
          <Code block>{snippet}</Code>

          <CopyButton value={snippet}>
            {({ copied, copy }) => (
              <Button
                leftSection={<Icon name="copy" size={16} />}
                onClick={copy}
              >
                {copied ? t`Copied!` : t`Copy Code`}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Card>

      {isCreateApiKeyModalOpen && (
        <CreateApiKeyModal
          onClose={closeCreateApiKeyModal}
          onCreate={(key) => updateSettings({ apiKey: key })}
        />
      )}
    </Stack>
  );
};
