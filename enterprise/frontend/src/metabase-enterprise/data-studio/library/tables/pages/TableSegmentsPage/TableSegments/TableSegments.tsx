import { SegmentList } from "metabase/data-studio/data-model/pages/DataModel/TableSection/SegmentList";
import { TableFiltering } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableFiltering";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

type TableSegmentsProps = {
  table: Table;
};

export function TableSegments({ table }: TableSegmentsProps) {
  return (
    <Stack gap="xl" maw={720} pb="xl">
      <TableFiltering table={table} readOnly={!table.can_write} />
      <SegmentList
        table={table}
        urls={{
          segment: (segmentId) =>
            Urls.dataStudioPublishedTableSegment(table.id, segmentId),
          newSegment: Urls.dataStudioPublishedTableSegmentNew(table.id),
          systemSegment: (role) =>
            Urls.dataStudioDataModelSystemSegment({
              databaseId: table.db_id,
              schemaName: table.schema,
              tableId: table.id,
              role,
            }),
        }}
      />
    </Stack>
  );
}
