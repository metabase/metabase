import {
  MeasureList,
  type MeasureListUrls,
} from "metabase/data-studio/data-model/pages/DataModel/TableSection/MeasureList";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import {
  ListLayoutToggle,
  useListLayout,
} from "../../../components/ListLayoutToggle";

type TableMeasuresProps = {
  table: Table;
};

/**
 * The published table's measures and measure groups, the same list Connected
 * data shows, opening the Library's measure pages.
 */
export function TableMeasures({ table }: TableMeasuresProps) {
  const [layout, setLayout] = useListLayout();
  return (
    <>
      <MeasureList
        table={table}
        getUrls={getPublishedMeasureUrls}
        isSearchable={false}
        isFullPage
        layout={layout}
      />
      <ListLayoutToggle layout={layout} onChange={setLayout} />
    </>
  );
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
