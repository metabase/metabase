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
      .map((operator) => Lib.displayInfo(query, stageIndex, operator))
      .map((operatorInfo) => [
        operatorInfo.shortName,
        getOperatorInfo(operatorInfo),
      ]),
  );

  return Object.values(options)
    .filter((option) => operatorInfoByName[option.operator] != null)
    .map((option) => ({
      name: operatorInfoByName[option.operator].longDisplayName,
      ...option,
    }));
}

function getOperatorInfo(operatorInfo: Lib.FilterOperatorDisplayInfo) {
  if (operatorInfo.shortName === "between") {
    return {
      ...operatorInfo,
      longDisplayName: "Range",
    };
  }

  return operatorInfo;
}

export function getDefaultAvailableOperator<T extends Lib.FilterOperatorName>(
  options: FilterOperatorOption<T>[],
  desiredOperator?: T,
): T {
  return (
    options.find((option) => option.operator === desiredOperator)?.operator ??
    options[0].operator
  );
}
