import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import { getUserCanWriteSegments } from "metabase/data-studio/selectors";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Button, Group, Icon, Stack } from "metabase/ui";
import type { Table } from "metabase-types/api";

import S from "../TableSection.module.css";

import { SegmentItem } from "./SegmentItem";

type SegmentListProps = {
  table: Table;
};

export function SegmentList({ table }: SegmentListProps) {
  const segments = table.segments ?? [];
  const getSegmentHref = (segmentId: number) =>
    Urls.dataStudioDataModelSegment({
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      segmentId,
    });
  const canCreateSegment = useSelector((state) =>
    getUserCanWriteSegments(state, table.is_published),
  );

  return (
    <Stack gap="md" data-testid="table-segments-page">
      {canCreateSegment && (
        <Group gap="md" justify="flex-start" wrap="nowrap">
          <Button
            component={ForwardRefLink}
            to={Urls.newDataStudioDataModelSegment({
              databaseId: table.db_id,
              schemaName: table.schema,
              tableId: table.id,
            })}
            h={32}
            px="sm"
            py="xs"
            size="xs"
            leftSection={<Icon name="add" />}
          >{t`New segment`}</Button>
        </Group>
      )}

      {segments.length === 0 ? (
        <EmptyState
          className={S.EmptyState}
          spacing="sm"
          illustrationElement={
            <Icon name="segment2" size={32} c="text-secondary" />
          }
          title={t`No segments yet`}
          message={t`Create a segment to filter rows in this table.`}
        />
      ) : (
        <Stack gap="sm" role="list">
          {segments.map((segment) => (
            <SegmentItem
              key={segment.id}
              segment={segment}
              href={getSegmentHref(segment.id)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
