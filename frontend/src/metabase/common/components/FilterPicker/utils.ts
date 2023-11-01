import _ from "underscore";
import * as Lib from "metabase-lib";
import type { PickerOperatorOption } from "./types";

export function getAvailableOperatorOptions<
  T extends PickerOperatorOption<Lib.FilterOperatorName>,
>(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  pickerOptions: Record<string, T>,
) {
  const columnOperatorInfos = Lib.filterableColumnOperators(column).map(
    operator => Lib.displayInfo(query, stageIndex, operator),
  );

  const columnOperatorsByName = _.indexBy(columnOperatorInfos, "shortName");
  const columnOperatorNames = Object.keys(columnOperatorsByName);

  const supportedPickerOptions = Object.values(pickerOptions).filter(option =>
    columnOperatorNames.includes(option.operator),
  );

  return supportedPickerOptions.map(option => ({
    name: columnOperatorsByName[option.operator].longDisplayName,
    ...option,
  }));
}
