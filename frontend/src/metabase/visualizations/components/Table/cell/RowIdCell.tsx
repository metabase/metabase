import cx from "classnames";
import type React from "react";
import { memo } from "react";
import { t } from "ttag";

import { Icon, Tooltip } from "metabase/ui";

import TableS from "../Table.module.css";

import { BaseCell } from "./BaseCell";
import S from "./RowIdCell.module.css";

export interface RowIdCellProps {
  value?: React.ReactNode;
  backgroundColor?: string;
}

export const RowIdCell = memo(function RowIdCell({
  value,
  backgroundColor,
}: RowIdCellProps) {
  const hasValue = value != null;

  return (
    <Tooltip label={t`View details`}>
      <BaseCell
        className={cx(S.root)}
        backgroundColor={backgroundColor}
        align="right"
        data-testid="detail-shortcut"
      >
        {hasValue ? (
          <span className={cx(S.rowNumber, TableS.rowHoverHidden)}>
            {value}
          </span>
        ) : null}

        <Icon
          className={cx(TableS.rowHoverVisible, {})}
          name="expand"
          size={14}
        />
      </BaseCell>
    </Tooltip>
  );
});
