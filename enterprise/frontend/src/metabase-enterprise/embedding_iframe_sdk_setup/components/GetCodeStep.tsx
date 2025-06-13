import { t } from "ttag";

import {
  ActionIcon,
  Button,
  Card,
  Code,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import { API_KEY_PLACEHOLDER } from "../constants";

export const GetCodeStep = () => {
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
        <Text size="lg" fw="bold" mb="md">
          {t`Authentication`}
        </Text>
        <Text size="sm" c="text-medium" mb="md">
          {/* eslint-disable-next-line no-literal-metabase-strings -- This is an example message for admins */}
          {t`This API key is for demonstration purposes only. In production, you should create a least privileged and sandboxed API key to prevent unwanted access to your Metabase instance.`}
        </Text>
        <TextInput
          value=""
          placeholder={API_KEY_PLACEHOLDER}
          readOnly
          rightSection={
            <ActionIcon
              onClick={() => copyToClipboard(API_KEY_PLACEHOLDER)}
              variant="subtle"
            >
              <Icon name="copy" size={16} />
            </ActionIcon>
          }
        />
      </Card>

      <Card p="md">
        <Text size="lg" fw="bold" mb="md">
          {t`Embed Code`}
        </Text>
        <Stack gap="xs">
          <Code block>{snippet}</Code>
          <Button
            leftSection={<Icon name="copy" size={16} />}
            onClick={() => copyToClipboard(snippet)}
          >
            {t`Copy Code`}
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
};
