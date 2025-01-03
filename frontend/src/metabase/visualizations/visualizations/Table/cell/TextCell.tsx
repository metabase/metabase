import cx from "classnames";
import { memo, type CSSProperties } from "react";

import type { TableCellFormatter } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import styles from "../Table.module.css";

import { BaseCell, type BaseCellProps } from "./BaseCell";

type TextCellProps = BaseCellProps & {
  value: RowValue;
  formatter?: TableCellFormatter;
  style?: CSSProperties;
  isPK?: boolean;
  isFK?: boolean;
};

export const TextCell = memo(function TextCell({
  value,
  formatter = (value: RowValue) => String(value),
  style,
  isPK,
  isFK,
  onClick,
  textAlign,
  children,
}: TextCellProps) {
  const formattedValue = formatter(value);

  return (
    <BaseCell
      textAlign={textAlign}
      className={cx(styles.cellWrapper, {
        [styles.idCell]: isPK,
        [styles.fkCell]: isFK,
      })}
      style={style}
      onClick={onClick}
    >
      <div className={styles.cellData}>{children ?? formattedValue}</div>
    </BaseCell>
  );
});
