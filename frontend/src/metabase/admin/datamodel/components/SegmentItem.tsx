import Link from "metabase/common/components/Link";
import { usePath } from "metabase/common/hooks";
import { TableBreadcrumbs } from "metabase/metadata/components";
import { Box, Flex, Group, Icon, NavLink, Stack, Text } from "metabase/ui";
import type { Segment } from "metabase-types/api";

import SegmentActionSelect from "./SegmentActionSelect";

interface Props {
  segment: Segment;
  onRetire: () => void;
}

export const SegmentItem = ({ segment, onRetire }: Props) => {
  const path = usePath();

  const currentPathId = path?.split("/").pop();
  const isActive = currentPathId === String(segment.id);

  return (
    <NavLink
      component={Link}
      to={`/bench/segment/${segment.id}`}
      active={isActive}
      label={
        <Flex justify="space-between">
          <Stack gap="sm">
            <Link to={`/bench/segment/${segment.id}`}>
              <Group display="inline-flex" gap="sm" wrap="nowrap">
                <Box
                  color="text-medium"
                  component={Icon}
                  flex="0 0 auto"
                  name="segment"
                />
                <Box c="text-dark" fw="bold">
                  {segment.name}
                </Box>
              </Group>
            </Link>
            <Box maw={500} c="text-light">
              <TableBreadcrumbs tableId={segment.table_id} />
            </Box>

            <Text c="text-light">

              {segment.definition_description}
            </Text>

          </Stack>
          <Box>
            <Flex justify="center">
              <SegmentActionSelect object={segment} onRetire={onRetire} />
            </Flex>
          </Box>
        </Flex>
      }
    />
  );
};
