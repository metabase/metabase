import { t } from "ttag";

import { Select } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { fromSelectValue, toSelectValue } from "../../lib";
import type { ColumnAndSeparator, ColumnOption } from "../../types";

interface Props {
  column: Lib.ColumnMetadata;
  index: number;
  options: ColumnOption[];
  separator: string;
  showLabels: boolean;
  showRemove: boolean;
  showSeparator: boolean;
  onChange: (index: number, change: Partial<ColumnAndSeparator>) => void;
}

export const ColumnAndSeparatorRow = ({
  column,
  index,
  options,
  separator,
  showLabels,
  showRemove,
  showSeparator,
  onChange,
}: Props) => {
  return (
    <Select
      data={options}
      value={toSelectValue(column)}
      label={showLabels ? t`Column` : undefined}
      onChange={value => {
        const column = fromSelectValue(value);
        onChange(index, { column });
      }}
    />
  );
};
