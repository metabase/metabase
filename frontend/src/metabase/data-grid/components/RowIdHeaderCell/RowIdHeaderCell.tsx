import { BaseCell } from "metabase/data-grid/components/BaseCell";
import S from "./RowIdHeaderCell.module.css";

export interface RowIdHeaderCellProps {
  name?: string;
}

export const RowIdHeaderCell = ({ name = "" }: RowIdHeaderCellProps) => {
  return (
    <BaseCell className={S.root} align="right">
      {name}{" "}
    </BaseCell>
  );
};
