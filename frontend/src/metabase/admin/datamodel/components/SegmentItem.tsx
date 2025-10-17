import { Ellipsified } from "metabase/common/components/Ellipsified";
import Link from "metabase/common/components/Link";
import { TableBreadcrumbs } from "metabase/metadata/components";
import { Box, Flex, Group, Icon, NavLink, Stack } from "metabase/ui";
import type Segment from "metabase-lib/v1/metadata/Segment";

import { SegmentActionSelect } from "./SegmentActionSelect";

interface Props {
  segment: Segment;
  onRetire: () => void;
  isActive?: boolean;
}

export const SegmentItem = ({ segment, onRetire, isActive }: Props) => {
  return (
    <Box pos="relative">
      <NavLink
        component={Link}
        to={`/bench/segment/${segment.id}`}
        active={isActive}
        label={
          <Flex justify="space-between" pt="0.125rem">
            <Stack gap="sm" style={{ overflow: "hidden" }}>
              <Group display="inline-flex" gap="sm" wrap="nowrap">
                <Box
                  color="text-medium"
                  component={Icon}
                  flex="0 0 auto"
                  name="segment"
                />
                <Ellipsified c="text-dark" fw="bold" pr="lg">
                  {segment.name}
                </Ellipsified>
              </Group>
              <Box maw={500} c="text-light">
                <TableBreadcrumbs tableId={segment.table_id} />
              </Box>
            </Stack>
          </Flex>
        }
      />
      <Box pos="absolute" right="0.25rem" top="0.25rem">
        <SegmentActionSelect segment={segment} onRetire={onRetire} />
      </Box>
    </Box>
  );
};
