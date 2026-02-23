import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";
import { TableBreadcrumbs } from "metabase/metadata/components";
import { Box, Flex, Group, Icon } from "metabase/ui";
import type { Segment } from "metabase-types/api";

import { SegmentActionSelect } from "./SegmentActionSelect";
import S from "./SegmentItem.module.css";

interface Props {
  segment: Segment;
  onRetire?: () => void;
  readOnly?: boolean;
}

export const SegmentItem = ({ segment, onRetire, readOnly }: Props) => {
  const canEdit = !!onRetire;

  return (
    <tr>
      <Box component="td" className={S.cell} p="sm">
        {canEdit ? (
          <Link to={Urls.dataModelSegment(segment.id)}>
            <Group display="inline-flex" gap="sm" wrap="nowrap">
              <Box
                color="text-secondary"
                component={Icon}
                flex="0 0 auto"
                name="segment"
              />
              <Box c="text-primary" fw="bold">
                {segment.name}
              </Box>
            </Group>
          </Link>
        ) : (
          <Group display="inline-flex" gap="sm" wrap="nowrap">
            <Icon name="segment" c="text-secondary" flex="0 0 auto" />
            <Box c="text-primary" fw="bold">
              {segment.name}
            </Box>
          </Group>
        )}
      </Box>

      <Box component="td" className={S.cell} maw={500} p="sm">
        <TableBreadcrumbs tableId={segment.table_id} />
      </Box>

      <Box component="td" className={S.cell} p="sm">
        {segment.definition_description}
      </Box>

      {onRetire && (
        <Box component="td" className={S.cell} p="sm">
          <Flex justify="center">
            <SegmentActionSelect
              object={segment}
              onRetire={onRetire}
              readOnly={readOnly}
            />
          </Flex>
        </Box>
      )}
    </tr>
  );
};
