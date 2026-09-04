import { jt, t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { useSetting } from "metabase/settings";
import { AdminSettingInput } from "metabase/settings-components/AdminSettingInput";
import { Box, Group, HoverCard, Icon, Text } from "metabase/ui";

export const CorsInputWidget = () => {
  const isLocalhostCorsDisabled = useSetting("disable-cors-on-localhost");
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  const corsHintText = isLocalhostCorsDisabled
    ? t`Separate values with a space. Localhost is not allowed. Changes will take effect within one minute.`
    : t`Separate values with a space. Localhost is automatically included. Changes will take effect within one minute.`;

  const hint = (
    <HoverCard key="embedding-cors-hint" position="bottom">
      <HoverCard.Target>
        <Icon
          name="info"
          c="text-secondary"
          cursor="pointer"
          ml="sm"
          style={{ verticalAlign: "middle" }}
        />
      </HoverCard.Target>

      <HoverCard.Dropdown>
        <Box p="lg" w={270}>
          <Text lh="lg" c="text-secondary">
            {corsHintText}
          </Text>
        </Box>
      </HoverCard.Dropdown>
    </HoverCard>
  );

  // The paid design names the methods this covers and the API-key caveat;
  // below the paywall the SDK is not available, so the plain line applies.
  const corsDescription = hasSimpleEmbedding
    ? jt`Add the website domains where you want to allow Modular embedding and SDK. SDK using API keys can only run on localhost. ${hint}`
    : jt`Add the website domains where you want to allow embedding. ${hint}`;

  return (
    <AdminSettingInput
      title={t`Cross-Origin Resource Sharing (CORS)`}
      description={
        <Group align="center" gap="sm">
          <Text c="text-secondary" fz="md">
            {corsDescription}
          </Text>
        </Group>
      }
      name="embedding-app-origins-sdk"
      placeholder="https://*.example.com"
      inputType="text"
    />
  );
};
