import type { MouseEvent, ReactNode } from "react";
import type { RenderHeaderCellProps } from "react-data-grid";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import type { RowValue } from "metabase-types/api";

import { BaseCell } from "./BaseCell";
import styles from "./HeaderCell.module.css";

export type HeaderCellProps = RenderHeaderCellProps<RowValue[]> & {
  textAlign?: "left" | "right";
  children?: ReactNode;
  onHeaderClick?: (event: MouseEvent<HTMLDivElement>) => void;
};

export const HeaderCell = ({
  column,
  textAlign = "left",
  children,
  onHeaderClick,
}: HeaderCellProps) => {
  return (
    <BaseCell
      textAlign={textAlign}
      className={styles.headerCell}
      onClick={onHeaderClick}
    >
      <Ellipsified tooltip={column.name}>{children}</Ellipsified>
    </BaseCell>
  );
};
