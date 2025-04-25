import type { ColumnDef } from "@tanstack/react-table";
import { t } from "ttag";

import { BaseCell } from "metabase/data-grid";
import S from "metabase/data-grid/components/HeaderCell/HeaderCell.module.css";
import {
  MIN_COLUMN_WIDTH,
  ROW_ACTIONS_COLUMN_ID,
} from "metabase/data-grid/constants";
import type { RowActionsColumnConfig } from "metabase/data-grid/types";
import { Button, Group } from "metabase/ui";

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
    cell: ({ row }) => {
      return (
        <BaseCell data-testid="row-id-cell" className={S.root}>
          <Group>
            {actions.map((action) => (
              <Button
                key={action.id}
                variant="subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  onActionRun(action, row);
                }}
              >
                {action.name}
              </Button>
            ))}
          </Group>
        </BaseCell>
      );
    },
    header: () => {
      return (
        <BaseCell className={S.root} hasHover={false}>
          {t`Row Actions`}
        </BaseCell>
      );
    },
  };
};
