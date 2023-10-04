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
  onChange: (operator: Lib.FilterOperatorName) => void;
};

export function FilterOperatorPicker({
  query,
  stageIndex,
  column,
  value,
  onChange,
}: FilterOperatorPickerProps) {
  const options: Option[] = useMemo(
    () => getOptions(query, stageIndex, column),
    [query, stageIndex, column],
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
): Option[] {
  const operators = Lib.filterableColumnOperators(column);

  return operators.map(operator => {
    const operatorInfo = Lib.displayInfo(query, stageIndex, operator);

    return {
      name: operatorInfo.longDisplayName,
      value: operatorInfo.shortName,
    };
  });
}
