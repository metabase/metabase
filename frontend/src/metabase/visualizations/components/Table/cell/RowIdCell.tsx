import cx from "classnames";
import type React from "react";
import { t } from "ttag";

import { Icon, Tooltip } from "metabase/ui";

import TableS from "../Table.module.css";

import S from "./RowIdCell.module.css";
import { BaseCell } from "./BaseCell";
import { memo } from "react";

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
      >
        {hasValue ? (
          <span className={cx(S.rowNumber, TableS.rowHoverHidden)}>
            {value}
          </span>
        ) : null}

        <Icon
          data-testid="detail-shortcut"
          className={cx(TableS.rowHoverVisible, {})}
          name="expand"
          size={14}
        />
      </BaseCell>
    </Tooltip>
  );
});
