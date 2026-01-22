import { jt, t } from "ttag";

import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useSetting } from "metabase/common/hooks";
import { Box, Group, HoverCard, Icon, Text } from "metabase/ui";

export const CorsInputWidget = () => {
  const isReactSdkEnabled = useSetting("enable-embedding-sdk");
  const isLocalhostCorsDisabled = useSetting("disable-cors-on-localhost");

  const isSimpleEmbedEnabled = useSetting("enable-embedding-simple");
  const isStaticEmbedEnabled = useSetting("enable-embedding-static");

  const corsHintText = isLocalhostCorsDisabled
    ? t`Separate values with a space. Localhost is not allowed. Changes will take effect within one minute.`
    : t`Separate values with a space. Localhost is automatically included. Changes will take effect within one minute.`;

  const canEditSdkOrigins =
    isReactSdkEnabled || isSimpleEmbedEnabled || isStaticEmbedEnabled;

  return (
    <AdminSettingInput
      title={t`Cross-Origin Resource Sharing (CORS)`}
      description={
        <Group align="center" gap="sm">
          <Text c="text-secondary" fz="md">
            {jt`Add the website domains where you want to allow modular embedding (with or without SDK). API keys can only be used on localhost. ${(
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
                  <Box p="md" w={270}>
                    <Text lh="lg" c="text-secondary">
                      {corsHintText}
                    </Text>
                  </Box>
                </HoverCard.Dropdown>
              </HoverCard>
            )}`}
          </Text>
        </Group>
      }
      name="embedding-app-origins-sdk"
      placeholder="https://*.example.com"
      inputType="text"
      disabled={!canEditSdkOrigins}
    />
  );
};
