import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { useSetting, useToast } from "metabase/common/hooks";
import {
  Box,
  Button,
  Card,
  Group,
  HoverCard,
  Icon,
  Stack,
  Text,
} from "metabase/ui";

export const EnableEmbeddedAnalyticsCard = () => {
  const isSimpleEmbeddingEnabled = useSetting("enable-embedding-simple");
  const [updateSettings] = useUpdateSettingsMutation();
  const [sendToast] = useToast();

  const handleEnableEmbedding = async () => {
    try {
      await updateSettings({ "enable-embedding-simple": true });
      sendToast({
        message: t`Embedded Analytics JS is enabled. You can configure it in admin settings.`,
      });
    } catch (error) {
      sendToast({ message: t`Failed to enable Embedded Analytics JS` });
    }
  };

  // eslint-disable-next-line no-literal-metabase-strings -- admin only
  const tooltip1 = t`When using the Embedded analytics SDK, each end user should have their own Metabase account.`;

  // eslint-disable-next-line no-literal-metabase-strings -- admin only
  const tooltip2 = t`Sharing Metabase accounts is a security risk. Even if you filter data on the client side, each user could use their token to view any data visible to that shared user account. That, and we consider shared accounts to be unfair usage of our terms.`;

  // eslint-disable-next-line no-literal-metabase-strings -- admin only
  const tooltip3 = t`Fair usage of the SDK involves giving each end-user of the embedded analytics their own Metabase account.`;

  return (
    <Card p="lg" mb="lg" bg="bg-light">
      <Stack gap="xs">
        <Text fz="md" c="text-dark" m={0}>
          {t`Enable Embedded Analytics JS to get started.`}
        </Text>

        <Text size="sm" color="text-medium">
          {t`By continuing, you agree to the fair usage conditions.`}

          <HoverCard position="right" withArrow>
            <HoverCard.Target>
              <Box>
                <Icon name="info" size={16} color="text-medium" />
              </Box>
            </HoverCard.Target>

            <HoverCard.Dropdown>
              <Text size="sm">{tooltip1}</Text>
              <Text>{tooltip2}</Text>
              <Text>{tooltip3}</Text>
            </HoverCard.Dropdown>
          </HoverCard>
        </Text>

        <Group>
          <Button
            variant={isSimpleEmbeddingEnabled ? "default" : "filled"}
            onClick={handleEnableEmbedding}
            disabled={isSimpleEmbeddingEnabled}
          >
            {isSimpleEmbeddingEnabled ? t`Enabled` : t`Enable to continue`}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
