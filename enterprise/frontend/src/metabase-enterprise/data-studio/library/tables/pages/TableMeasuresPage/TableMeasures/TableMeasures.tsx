import { MeasureList } from "metabase/data-studio/data-model/pages/DataModel/TableSection/MeasureList";
import { Box } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

type TableMeasuresProps = {
  table: Table;
};

export function TableMeasures({ table }: TableMeasuresProps) {
  return (
    <Box maw={720} pb="xl">
      <MeasureList
        table={table}
        urls={{
          measure: (measureId) =>
            Urls.dataStudioPublishedTableMeasure(table.id, measureId),
          newMeasure: Urls.dataStudioPublishedTableMeasureNew(table.id),
        }}
      />
    </Box>
  );
}
