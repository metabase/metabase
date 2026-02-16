import { t } from "ttag";

import { DATA_STUDIO_UPGRADE_URL } from "metabase/admin/upsells/constants";
import { Button, Card, Divider, Flex, Group, Stack, Text } from "metabase/ui";

type SelfHostedContentProps = {
  handleModalClose: VoidFunction;
};

export const SelfHostedRightColumnContent = ({
  handleModalClose,
}: SelfHostedContentProps) => {
  const handleOnClick = () => {
    window.open(DATA_STUDIO_UPGRADE_URL);
    handleModalClose();
  };

  return (
    <Flex justify="flex-end">
      <Stack gap="lg">
        <Card withBorder p="md" radius="md">
          <Flex direction="column" style={{ flex: 1 }}>
            <Group justify="space-between" align="flex-start">
              <Text fw="bold">{t`SQL + Python`}</Text>
            </Group>
            <Text size="sm" c="text-secondary" mt="sm">
              {t`Run Python-based transforms alongside SQL to handle more complex logic and data workflows.`}
            </Text>
          </Flex>
        </Card>
        <Divider />
        <Button variant="filled" size="md" onClick={handleOnClick} fullWidth>
          {t`Get Python transforms`}
        </Button>
      </Stack>
    </Flex>
  );
};
