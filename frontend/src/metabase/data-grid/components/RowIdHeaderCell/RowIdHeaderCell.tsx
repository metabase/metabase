import cx from "classnames";

import { BaseCell } from "metabase/data-grid/components/BaseCell/BaseCell";

import S from "./RowIdHeaderCell.module.css";

export interface RowIdHeaderCellProps {
  name?: string;
}

export const RowIdHeaderCell = ({ name = "" }: RowIdHeaderCellProps) => {
  return (
    <BaseCell className={cx(S.root)} hasHover={false} align="right">
      {name}
    </BaseCell>
  );
};
