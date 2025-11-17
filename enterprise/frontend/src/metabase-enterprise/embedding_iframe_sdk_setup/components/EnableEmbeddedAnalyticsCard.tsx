import { useState } from "react";
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

  // Freeze the card visibility to show even when we enabled the embedding setting.
  // This allows us to show the "Enabled" button state and not hide the card.
  const [showSimpleEmbedding] = useState(!isSimpleEmbeddingEnabled);

  const handleEnableEmbedding = async () => {
    try {
      await updateSettings({
        "enable-embedding-simple": true,

        // accept the terms for Embedded Analytics JS
        "show-simple-embed-terms": false,
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

  if (!showSimpleEmbedding) {
    return null;
  }

  return (
    <Card p="md" mb="md">
      <Stack gap={0}>
        <Text fz="md" c="text-primary">
          {t`Enable Embedded Analytics JS to get started.`}
        </Text>

        <Group gap="xs">
          <Text size="sm" c="text-secondary">
            {t`By continuing, you agree to the fair usage conditions.`}
          </Text>

          <HoverCard position="right-start" withArrow>
            <HoverCard.Target>
              <Box>
                <Icon name="info" size={14} c="text-secondary" />
              </Box>
            </HoverCard.Target>

            <HoverCard.Dropdown>
              <Stack maw={340} p="md" gap="md">
                <Text fz="sm" lh="lg">
                  {tooltip1}
                </Text>

                <Text fz="sm" lh="lg">
                  {tooltip2}
                </Text>

                <Text fz="sm" lh="lg">
                  {tooltip3}
                </Text>
              </Stack>
            </HoverCard.Dropdown>
          </HoverCard>
        </Group>

        <Group justify="flex-end" mt="md">
          <Button
            variant={isSimpleEmbeddingEnabled ? "default" : "filled"}
            onClick={handleEnableEmbedding}
            disabled={isSimpleEmbeddingEnabled}
            leftSection={isSimpleEmbeddingEnabled && <Icon name="check" />}
          >
            {isSimpleEmbeddingEnabled ? t`Enabled` : t`Enable to continue`}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
