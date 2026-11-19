import * as Urls from "metabase/urls";

import type { SegmentMeasureData, TreeItem } from "../types";

export const getTreeRowHref = (row: { original: TreeItem }): string | null => {
  const { model, data } = row.original;

  // Segment and measure rows are built from their published table, see `SegmentMeasureData`
  if (model === "segment" || model === "measure") {
    const leaf = data as unknown as SegmentMeasureData;
    const tableParams = {
      databaseId: leaf.databaseId,
      schemaName: leaf.schemaName,
      tableId: leaf.table_id,
    };
    return model === "segment"
      ? Urls.dataStudioDataModelSegment({ ...tableParams, segmentId: leaf.id })
      : Urls.dataStudioDataModelMeasure({ ...tableParams, measureId: leaf.id });
  }

  if (data.model === "empty-state" || data.model === "collection") {
    return null;
  }
  if (data.id == null) {
    return null;
  }

  switch (data.model) {
    case "table":
      return Urls.dataStudioTable(data.id);
    case "metric":
      return Urls.dataStudioMetric(data.id);
    case "snippet":
      return Urls.dataStudioSnippet(data.id);
    case "action":
      return Urls.dataStudioAction(data.id);
    default:
      return null;
  }
};
