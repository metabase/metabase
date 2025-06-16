import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { c, t } from "ttag";

import { CreateApiKeyModal } from "metabase/admin/settings/components/ApiKeys/CreateApiKeyModal";
import {
  ActionIcon,
  Anchor,
  Button,
  Card,
  Code,
  Icon,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";

import { API_KEY_PLACEHOLDER } from "../constants";

export const GetCodeStep = () => {
  const [apiKey, setApiKey] = useState("");
  const [
    isCreateApiKeyModalOpen,
    { open: openCreateApiKeyModal, close: closeCreateApiKeyModal },
  ] = useDisclosure(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // eslint-disable-next-line no-literal-metabase-strings -- code snippet
  const snippet = `<script src="http://localhost:3000/app/embed.js"></script>
<div id="metabase-embed"></div>

<script>
  const { MetabaseEmbed } = window["metabase.embed"];

  const embed = new MetabaseEmbed({
    target: "#metabase-embed",
    instanceUrl: "http://localhost:3000",
    apiKey: "${API_KEY_PLACEHOLDER}",
    dashboardId: 1,
  });
</script>`;

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
            value={apiKey}
            placeholder={API_KEY_PLACEHOLDER}
            onChange={(e) => setApiKey(e.target.value)}
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
          <Button
            leftSection={<Icon name="copy" size={16} />}
            onClick={() => copyToClipboard(snippet)}
          >
            {t`Copy Code`}
          </Button>
        </Stack>
      </Card>

      {isCreateApiKeyModalOpen && (
        <CreateApiKeyModal
          onClose={closeCreateApiKeyModal}
          onCreate={(key) => setApiKey(key)}
        />
      )}
    </Stack>
  );
};
