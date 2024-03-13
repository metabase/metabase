import { Select } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { fromSelectValue, toSelectValue } from "../../lib";
import type { ColumnAndSeparator, ColumnOption } from "../../types";

interface Props {
  canEditSeparator: boolean;
  canRemove: boolean;
  column: Lib.ColumnMetadata;
  index: number;
  options: ColumnOption[];
  separator: string;
  onChange: (index: number, change: Partial<ColumnAndSeparator>) => void;
}

export const ColumnAndSeparatorRow = ({
  canEditSeparator,
  canRemove,
  column,
  index,
  options,
  separator,
  onChange,
}: Props) => {
  return (
    <Select
      data={options}
      value={toSelectValue(column)}
      onChange={value => {
        const column = fromSelectValue(value);
        onChange(index, { column });
      }}
    />
  );
};
