import type { RenderHeaderCellProps } from "react-data-grid";

import type { RowValue } from "metabase-types/api";

import { BaseCell, type BaseCellProps } from "./BaseCell";

type HeaderCellProps = RenderHeaderCellProps<RowValue[]> & BaseCellProps;

export const HeaderCell = ({ column, onClick }: HeaderCellProps) => {
  return (
    <BaseCell onClick={onClick} textAlign="left">
      {column.name}
    </BaseCell>
  );
};
