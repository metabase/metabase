import type React from "react";
import { memo } from "react";

import { BaseCell, type BaseCellProps } from "./BaseCell";
import S from "./FooterCell.module.css";

export interface FooterCellProps extends BaseCellProps {
  value: React.ReactNode;
}

export const FooterCell = memo(function FooterCell({
  value,
  ...props
}: FooterCellProps) {
  return (
    <BaseCell className={S.root} {...props}>
      {value}
    </BaseCell>
  );
});
