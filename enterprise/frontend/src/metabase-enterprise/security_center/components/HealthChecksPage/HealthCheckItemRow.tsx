import { Link } from "metabase/common/components/Link";
import { Anchor, FixedSizeIcon, Flex, Group, Stack, Text } from "metabase/ui";
import type { HealthCheckId, HealthCheckItem } from "metabase-types/api";

import { getHealthCheckItemUrl, getStatusInfo } from "./utils";

const ROW_LINE_HEIGHT = "1.25rem";

type HealthCheckItemRowProps = {
  checkId: HealthCheckId;
  item: HealthCheckItem;
};

export const HealthCheckItemRow = ({
  checkId,
  item,
}: HealthCheckItemRowProps) => {
  const { label, icon, iconColor } = getStatusInfo(item.status);
  const url = getHealthCheckItemUrl(checkId, item);

  return (
    <Group
      gap="sm"
      wrap="nowrap"
      align="flex-start"
      px="lg"
      py="sm"
      data-testid="health-check-item"
    >
      <Flex h={ROW_LINE_HEIGHT} align="center">
        <FixedSizeIcon name={icon} c={iconColor} aria-label={label} />
      </Flex>
      <Stack gap="xxs" miw={0}>
        {item.entity_name &&
          (url ? (
            <Anchor component={Link} to={url} fw="bold" lh={ROW_LINE_HEIGHT}>
              {item.entity_name}
            </Anchor>
          ) : (
            <Text fw="bold" lh={ROW_LINE_HEIGHT}>
              {item.entity_name}
            </Text>
          ))}
        {item.message && (
          <Text c="text-secondary" lh={ROW_LINE_HEIGHT}>
            {item.message}
          </Text>
        )}
      </Stack>
    </Group>
  );
};
