import cx from "classnames";
import type React from "react";
import { t } from "ttag";

import { Icon, Tooltip } from "metabase/ui";

import TableS from "../Table.module.css";

import S from "./RowIdCell.module.css";

export interface RowIdCellProps {
  value?: React.ReactNode;
}

export const RowIdCell = ({ value }: RowIdCellProps) => {
  const hasValue = value != null;

  return (
    <Tooltip label={t`View details`}>
      <div className={cx(S.root)}>
        {hasValue ? <span className={S.rowNumber}>{value}</span> : null}

        <Icon
          data-testid="detail-shortcut"
          className={cx({
            [TableS.rowHoverVisible]: !hasValue,
            [S.expandIcon]: hasValue,
          })}
          name="expand"
          size={14}
        />
      </div>
    </Tooltip>
  );
};
