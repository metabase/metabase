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
          data-testid="row-id-cell"
          className={S.root}
          backgroundColor={hasValue ? backgroundColor : undefined}
          style={
            !hasValue && !backgroundColor
              ? { backgroundColor: "var(--mb-color-bg-white)" }
              : undefined
          }
          align="right"
        >
          {hasValue ? (
            <span className={cx(S.rowNumber, DataGridS.rowHoverHidden)}>
              {value}
            </span>
          ) : null}

          <Button
            data-testid="detail-shortcut"
            w={24}
            h={24}
            className={cx(DataGridS.rowHoverVisible, S.expandButton)}
            size="compact-md"
            leftSection={<Icon name="expand" size={14} />}
          />
        </BaseCell>
      </span>
    </Tooltip>
  );
});
