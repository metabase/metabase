import * as Lib from "metabase-lib";
import type { PickerOperatorOption } from "./types";

export function getAvailableOperatorOptions<
  T extends PickerOperatorOption<Lib.FilterOperatorName>,
>(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  pickerOptions: T[],
) {
  const columnOperators = Lib.filterableColumnOperators(column);
  const columnOperatorNames = columnOperators.map(
    operator => Lib.displayInfo(query, stageIndex, operator).shortName,
  );
  return pickerOptions.filter(option =>
    columnOperatorNames.includes(option.operator),
  );
}
