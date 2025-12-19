import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";
import { TableBreadcrumbs } from "metabase/metadata/components";
import { Box, Flex, Group, Icon } from "metabase/ui";
import type { Segment } from "metabase-types/api";

import { SegmentActionSelect } from "./SegmentActionSelect";
import S from "./SegmentItem.module.css";

interface Props {
  segment: Segment;
  onRetire: () => void;
}

export const SegmentItem = ({ segment, onRetire }: Props) => {
  return (
    <tr>
      <Box component="td" className={S.cell} p="sm">
        <Link to={Urls.dataModelSegment(segment.id)}>
          <Group display="inline-flex" gap="sm" wrap="nowrap">
            <Icon name="segment" c="text-secondary" flex="0 0 auto" />
            <Box c="text-primary" fw="bold">
              {segment.name}
            </Box>
          </Group>
        </Link>
      </Box>

      <Box component="td" className={S.cell} maw={500} p="sm">
        <TableBreadcrumbs tableId={segment.table_id} />
      </Box>

      <Box component="td" className={S.cell} p="sm">
        {segment.definition_description}
      </Box>

      <Box component="td" className={S.cell} p="sm">
        <Flex justify="center">
          <SegmentActionSelect object={segment} onRetire={onRetire} />
        </Flex>
      </Box>
    </tr>
  );
};
