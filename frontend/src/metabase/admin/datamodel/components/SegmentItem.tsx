import { useGetTableQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { modelIconMap } from "metabase/common/utils/icon";
import { TableBreadcrumbs } from "metabase/metadata/components";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Box, Flex, Group, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Segment } from "metabase-types/api";

import { SegmentActionSelect } from "./SegmentActionSelect";
import S from "./SegmentItem.module.css";

interface Props {
  segment: Segment;
  onRetire?: () => void;
}

export const SegmentItem = ({ segment, onRetire }: Props) => {
  const canEdit = !!onRetire;
  const segmentIcon = modelIconMap.segment;
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const { data: table } = useGetTableQuery({ id: segment.table_id });
  // Treat a table that has not loaded as published, so the write actions stay
  // closed until the answer is known.
  const isTablePublished = table?.is_published ?? true;
  const readOnly = isRemoteSyncReadOnly && isTablePublished;

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
                name={segmentIcon}
              />
              <Box c="text-primary" fw="bold">
                {segment.name}
              </Box>
            </Group>
          </Link>
        ) : (
          <Group display="inline-flex" gap="sm" wrap="nowrap">
            <Icon name={segmentIcon} c="text-secondary" flex="0 0 auto" />
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
