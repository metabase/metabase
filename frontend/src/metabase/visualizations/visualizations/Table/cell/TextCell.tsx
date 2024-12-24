import type { TableCellFormatter } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import { BaseCell, type BaseCellProps } from "./BaseCell";

type TextCellProps = BaseCellProps & {
  value: RowValue;
  formatter: TableCellFormatter;
};

export const TextCell = ({ value, formatter, ...rest }: TextCellProps) => {
  const formattedValue = formatter(value);

  return <BaseCell {...rest}>{formattedValue}</BaseCell>;
};
