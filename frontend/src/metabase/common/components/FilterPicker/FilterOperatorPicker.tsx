import type { ChangeEvent } from "react";
import { useMemo } from "react";
import Select from "metabase/core/components/Select";
import * as Lib from "metabase-lib";

type Option = {
  name: string;
  value: Lib.FilterOperatorName;
};

type FilterOperatorPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  value: Lib.FilterOperatorName | null;
  supportedOperators?: ReadonlyArray<Lib.FilterOperatorName>;
  onChange: (operator: Lib.FilterOperatorName) => void;
};

export function FilterOperatorPicker({
  query,
  stageIndex,
  column,
  value,
  supportedOperators,
  onChange,
}: FilterOperatorPickerProps) {
  const options: Option[] = useMemo(
    () => getOptions(query, stageIndex, column, supportedOperators),
    [query, stageIndex, column, supportedOperators],
  );

  return (
    <div>
      <Select
        options={options}
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          onChange(e.target.value as Lib.FilterOperatorName)
        }
      />
    </div>
  );
}

function getOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  supportedOperators?: ReadonlyArray<Lib.FilterOperatorName>,
): Option[] {
  const operators = Lib.filterableColumnOperators(column);
  let operatorInfos = operators.map(operator =>
    Lib.displayInfo(query, stageIndex, operator),
  );

  if (Array.isArray(supportedOperators)) {
    operatorInfos = operatorInfos.filter(operatorInfo =>
      supportedOperators.includes(operatorInfo.shortName),
    );
  }

  return operatorInfos.map(operatorInfo => ({
    name: operatorInfo.longDisplayName,
    value: operatorInfo.shortName,
  }));
}
