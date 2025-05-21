import type { ColumnDef } from "@tanstack/react-table";
import cx from "classnames";
import { t } from "ttag";

import { BaseCell } from "metabase/data-grid";
import S from "metabase/data-grid/components/RowActionCell/RowActionCell.module.css";
import {
  MIN_COLUMN_WIDTH,
  ROW_ACTIONS_COLUMN_ID,
} from "metabase/data-grid/constants";
import type { RowActionsColumnConfig } from "metabase/data-grid/types";
import { Button, Group, Stack } from "metabase/ui";

export const getActionsIdColumn = <TRow, TValue>({
  actions,
  onActionRun,
}: RowActionsColumnConfig<TRow>): ColumnDef<TRow, TValue> => {
  return {
    id: ROW_ACTIONS_COLUMN_ID,
    minSize: MIN_COLUMN_WIDTH,
    enableSorting: false,
    enableResizing: true,
    enablePinning: true,
    cell: ({ row }) => (
      <BaseCell data-testid="row-id-cell" className={S.cellRoot}>
        <Stack>
          {actions.map((action) => (
            <Button
              key={action.id}
              size="compact-sm"
              variant="subtle"
              onClick={(e) => {
                debugger;
                e.stopPropagation();
                onActionRun(action, row);
              }}
            >
              {action.name}
            </Button>
          ))}
        </Stack>
      </BaseCell>
    ),
    header: () => (
      <BaseCell className={cx(S.headerRoot)} hasHover={false}>
        {t`Row Actions`}
      </BaseCell>
    ),
  };
};
