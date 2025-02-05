import cx from "classnames";
import type React from "react";
import { memo } from "react";

import { BaseCell, type BaseCellProps } from "./BaseCell";
import S from "./FooterCell.module.css";

export interface FooterCellProps extends BaseCellProps {
  value: React.ReactNode;
  isSelected?: boolean;
}

export const FooterCell = memo(function FooterCell({
  value,
  isSelected,
  ...props
}: FooterCellProps) {
  return (
    <BaseCell
      className={cx(S.root, {
        [S.selected]: isSelected,
      })}
      {...props}
    >
      {value}
    </BaseCell>
  );
});
