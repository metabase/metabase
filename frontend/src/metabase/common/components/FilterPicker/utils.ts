import _ from "underscore";
import * as Lib from "metabase-lib";
import type {
  ColumnListItem,
  SegmentListItem,
  PickerOperatorOption,
} from "./types";

export function getAvailableOperatorOptions<
  T extends PickerOperatorOption<Lib.FilterOperatorName>,
>(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  pickerOptions: T[],
) {
  const columnOperatorInfos = Lib.filterableColumnOperators(column).map(
    operator => Lib.displayInfo(query, stageIndex, operator),
  );

  const columnOperatorsByName = _.indexBy(columnOperatorInfos, "shortName");
  const columnOperatorNames = Object.keys(columnOperatorsByName);

  const supportedPickerOptions = pickerOptions.filter(option =>
    columnOperatorNames.includes(option.operator),
  );

  return supportedPickerOptions.map(option => ({
    name: columnOperatorsByName[option.operator].longDisplayName,
    ...option,
  }));
}

export const isSegmentListItem = (
  item: ColumnListItem | SegmentListItem,
): item is SegmentListItem => {
  return (item as SegmentListItem).segment != null;
};
