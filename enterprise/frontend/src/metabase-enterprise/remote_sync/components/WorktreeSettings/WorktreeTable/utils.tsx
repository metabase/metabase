import type { Row } from "@tanstack/react-table";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import type { TreeTableColumnDef } from "metabase/ui";
import { Ellipsified, Flex, Group, Icon } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { RemoteSyncWorktree } from "metabase-types/api";

import { WorktreeMenu } from "../WorktreeMenu";

const ACTIONS_COLUMN_WIDTH = 56;

export function getNodeId(worktree: RemoteSyncWorktree) {
  return String(worktree.id);
}

export function getRowProps(row: Row<RemoteSyncWorktree>) {
  return {
    "data-testid": `worktree-row-${row.original.id}`,
    "aria-label": row.original.branch,
  };
}

export function getColumns(): TreeTableColumnDef<RemoteSyncWorktree>[] {
  return [
    {
      id: "branch",
      header: t`Branch`,
      minWidth: "auto",
      maxAutoWidth: 240,
      enableSorting: true,
      accessorFn: (worktree) => worktree.branch,
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
      accessorFn: (worktree) => getUserName(worktree.creator ?? undefined),
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "created_at",
      header: t`Created at`,
      width: 200,
      enableSorting: true,
      sortDescFirst: true,
      accessorFn: (worktree) => worktree.created_at,
      cell: ({ row }) => <DateTime value={row.original.created_at} />,
    },
    {
      id: "users",
      header: t`Users`,
      width: "auto",
      maxAutoWidth: 280,
      enableSorting: false,
      accessorFn: (worktree) => worktree.users.map(getUserName).join(", "),
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "actions",
      header: "",
      width: ACTIONS_COLUMN_WIDTH,
      enableSorting: false,
      cell: ({ row }) => (
        <Flex justify="center">
          <WorktreeMenu worktree={row.original} />
        </Flex>
      ),
    },
  ];
}
