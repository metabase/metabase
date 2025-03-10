import cx from "classnames";
import _ from "underscore";

import { BaseCell } from "metabase/data-grid/components/BaseCell/BaseCell";

import S from "./RowIdHeaderCell.module.css";

export interface RowIdHeaderCellProps {
  name?: string;
}

export const RowIdHeaderCell = ({ name = "" }: RowIdHeaderCellProps) => {
  return (
    <BaseCell
      className={cx(S.root, { [S.withName]: !_.isEmpty(name) })}
      hasHover={false}
      align="right"
    >
      {name}
    </BaseCell>
  );
};
