import { t } from "ttag";

import type { TreeItem } from "metabase/data-studio/common/types";
import { EntityNameCell, type TreeTableColumnDef } from "metabase/ui";

import { ArchivedItemMenu } from "./ArchivedItemMenu";
import type { ArchivedActionRowActions } from "./types";

const ACTIONS_COLUMN_WIDTH = 48;

function getNameColumn(): TreeTableColumnDef<TreeItem> {
  return {
    id: "name",
    header: t`Name`,
    enableSorting: true,
    accessorKey: "name",
    minWidth: 200,
    cell: ({ row }) => (
      <EntityNameCell
        data-testid={`${row.original.model}-name`}
        icon={row.original.icon}
        name={row.original.name}
      />
    ),
  };
}

function getActionsColumn(
  actions: ArchivedActionRowActions,
): TreeTableColumnDef<TreeItem> {
  return {
    id: "actions",
    width: ACTIONS_COLUMN_WIDTH,
    cell: ({ row }) => (
      <ArchivedItemMenu
        treeItem={row.original}
        readOnly={actions.readOnly}
        onUnarchive={actions.onUnarchive}
      />
    ),
  };
}

export function getColumns(
  actions: ArchivedActionRowActions,
): TreeTableColumnDef<TreeItem>[] {
  return [getNameColumn(), getActionsColumn(actions)];
}
