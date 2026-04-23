import type { Measure } from "metabase-types/api";

import {
  ItemList,
  type OmniPickerMeasureItem,
  type OmniPickerTableItem,
} from "../..";

function createMeasureItem(measure: Measure): OmniPickerMeasureItem {
  return {
    model: "measure",
    id: measure.id,
    name: measure.name,
  };
}

export function TableItemList({
  parentItem,
  pathIndex,
}: {
  parentItem: OmniPickerTableItem;
  pathIndex: number;
}) {
  return (
    <ItemList
      items={parentItem.measures?.map(createMeasureItem)}
      pathIndex={pathIndex}
    />
  );
}
