import type { Row } from "@tanstack/react-table";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import type { TreeTableColumnDef } from "metabase/ui";
import { Ellipsified, Flex, Group, Icon } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Workspace } from "metabase-types/api";

import { WorkspaceMenu } from "../WorkspaceMenu";

const ACTIONS_COLUMN_WIDTH = 56;

export function getNodeId(workspace: Workspace) {
  return String(workspace.id);
}

export function getRowProps(row: Row<Workspace>) {
  return {
    "data-testid": `workspace-row-${row.original.id}`,
    "aria-label": row.original.branch,
  };
}

export function getColumns(): TreeTableColumnDef<Workspace>[] {
  return [
    {
      id: "branch",
      header: t`Branch`,
      minWidth: "auto",
      maxAutoWidth: 240,
      enableSorting: true,
      accessorFn: (workspace) => workspace.branch,
      cell: ({ row }) => (
        <Group gap="sm" wrap="nowrap">
          <Icon name="git_branch" c="brand" />
          <Ellipsified>{row.original.branch}</Ellipsified>
        </Group>
      ),
    },
    {
      id: "creator",
      header: t`Created by`,
      width: "auto",
      enableSorting: true,
      accessorFn: (workspace) => getUserName(workspace.creator ?? undefined),
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "created_at",
      header: t`Created at`,
      width: 200,
      enableSorting: true,
      sortDescFirst: true,
      accessorFn: (workspace) => workspace.created_at,
      cell: ({ row }) => <DateTime value={row.original.created_at} />,
    },
    {
      id: "users",
      header: t`Users`,
      width: "auto",
      maxAutoWidth: 280,
      enableSorting: false,
      accessorFn: (workspace) => workspace.users.map(getUserName).join(", "),
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "actions",
      header: "",
      width: ACTIONS_COLUMN_WIDTH,
      enableSorting: false,
      cell: ({ row }) => (
        <Flex justify="center">
          <WorkspaceMenu workspace={row.original} />
        </Flex>
      ),
    },
  ];
}
