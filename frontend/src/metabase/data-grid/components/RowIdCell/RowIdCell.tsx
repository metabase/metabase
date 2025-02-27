import cx from "classnames";
import type React from "react";
import { memo } from "react";
import { t } from "ttag";

import { BaseCell } from "metabase/data-grid/components/BaseCell/BaseCell";
import DataGridS from "metabase/data-grid/components/DataGrid/DataGrid.module.css";
import { Icon, Tooltip } from "metabase/ui";

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
      <span>
        <BaseCell
          className={cx(S.root)}
          backgroundColor={backgroundColor}
          align="right"
          data-testid="detail-shortcut"
        >
          {hasValue ? (
            <span className={cx(S.rowNumber, DataGridS.rowHoverHidden)}>
              {value}
            </span>
          ) : null}

          <Icon
            className={cx(DataGridS.rowHoverVisible, {})}
            name="expand"
            size={14}
          />
        </BaseCell>
      </span>
    </Tooltip>
  );
});
