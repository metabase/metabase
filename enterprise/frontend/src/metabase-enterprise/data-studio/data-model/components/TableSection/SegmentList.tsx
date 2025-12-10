import { t } from "ttag";

import EmptyState from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import { Button, Group, Icon, Stack } from "metabase/ui";
import type { Segment, TableId } from "metabase-types/api";

import { SegmentItem } from "./SegmentItem";

type SegmentListProps = {
  segments: Segment[];
  tableId: TableId;
};

export function SegmentList({ segments, tableId }: SegmentListProps) {
  return (
    <Stack gap="md" data-testid="table-segments-page">
      <Group gap="md" justify="flex-start" wrap="nowrap">
        <Button
          component={ForwardRefLink}
          to={Urls.newDataStudioSegment(tableId)}
          h={32}
          px="sm"
          py="xs"
          size="xs"
          leftSection={<Icon name="add" />}
        >{t`New segment`}</Button>
      </Group>

      {segments.length === 0 ? (
        <EmptyState
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
              href={Urls.dataStudioSegment(segment.id)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
