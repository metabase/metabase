import cx from "classnames";
import type React from "react";
import { memo } from "react";
import { t } from "ttag";

import { BaseCell } from "metabase/data-grid/components/BaseCell/BaseCell";
import DataGridS from "metabase/data-grid/components/DataGrid/DataGrid.module.css";
import { Button, Icon, Tooltip } from "metabase/ui";

import S from "./RowIdCell.module.css";

export interface RowIdCellProps {
  value?: React.ReactNode;
  backgroundColor?: string;
  canExpand?: boolean;
}

export const RowIdCell = memo(function RowIdCell({
  value,
  backgroundColor,
  canExpand = true,
}: RowIdCellProps) {
  const hasValue = value != null;

  return (
    <Tooltip label={t`View details`} disabled={!canExpand}>
      <span>
        <BaseCell
          data-testid="row-id-cell"
          className={S.root}
          backgroundColor={backgroundColor}
          align="right"
        >
          {hasValue ? (
            <span
              className={cx(S.rowNumber, canExpand && DataGridS.rowHoverHidden)}
            >
              {value}
            </span>
          ) : null}
          {canExpand && (
            <Button
              data-testid="detail-shortcut"
              w={24}
              h={24}
              className={cx(DataGridS.rowHoverVisible, S.expandButton)}
              size="compact-md"
              leftSection={<Icon name="expand" size={14} />}
            />
          )}
        </BaseCell>
      </span>
    </Tooltip>
  );
});
