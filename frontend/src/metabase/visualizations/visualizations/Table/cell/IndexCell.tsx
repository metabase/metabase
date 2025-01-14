import { memo } from "react";

import { Icon } from "metabase/ui";

import S from "./IndexCell.module.css";

export type IndexCellProps = {
  rowNumber: number;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
};

export const IndexCell = memo(function IndexCell({
  rowNumber,
  onClick,
}: IndexCellProps) {
  return (
    <div className={S.root} onClick={onClick}>
      <span className={S.rowNumber}>{rowNumber}</span>
      <Icon className={S.expandIcon} name="expand" size={14} />
    </div>
  );
});
