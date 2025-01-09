import type { FilterOperatorOption } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";

export function getAvailableOperatorOptions<
  T extends FilterOperatorOption<Lib.FilterOperatorName>,
>(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  options: Record<string, T>,
) {
  const operatorInfoByName = Object.fromEntries(
    Lib.filterableColumnOperators(column)
      .map(operator => Lib.displayInfo(query, stageIndex, operator))
      .map(operatorInfo => [operatorInfo.shortName, operatorInfo]),
  );

  return Object.values(options)
    .filter(option => operatorInfoByName[option.operator] != null)
    .map(option => ({
      name: operatorInfoByName[option.operator].longDisplayName,
      ...option,
    }));
}
