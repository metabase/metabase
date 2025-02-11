import S from "./RowIdHeaderCell.module.css";

export interface RowIdHeaderCellProps {
  name?: string;
}

export const RowIdHeaderCell = ({ name = "" }: RowIdHeaderCellProps) => {
  return <div className={S.root}>{name}</div>;
};
