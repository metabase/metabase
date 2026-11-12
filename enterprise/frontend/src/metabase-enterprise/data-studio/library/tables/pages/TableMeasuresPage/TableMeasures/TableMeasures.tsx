import {
  type MeasureListUrls,
  MeasureTree,
} from "metabase/data-studio/data-model/pages/DataModel/TableSection/MeasureList";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

type TableMeasuresProps = {
  table: Table;
};

/**
 * The published table's measures and measure groups, and what sync proposes,
 * opening the Library's measure pages
 */
export function TableMeasures({ table }: TableMeasuresProps) {
  return <MeasureTree table={table} urls={getPublishedMeasureUrls(table)} />;
}

function getPublishedMeasureUrls(table: Table): MeasureListUrls {
  return {
    measure: (measureId) =>
      Urls.dataStudioPublishedTableMeasure(table.id, measureId),
    newMeasure: Urls.dataStudioPublishedTableMeasureNew(table.id),
    measureGroup: (groupId) =>
      Urls.dataStudioPublishedTableMeasureGroup(table.id, groupId),
    newMeasureGroup: Urls.dataStudioPublishedTableMeasureGroupNew(table.id),
  };
}
