import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useRemoveAnalystMutation } from "metabase/api";
import UserAvatar from "metabase/common/components/UserAvatar";
import { useToast } from "metabase/common/hooks";
import { getFullName } from "metabase/lib/user";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  ActionIcon,
  Box,
  Card,
  FixedSizeIcon,
  Flex,
  Menu,
  Stack,
  Text,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import type { User } from "metabase-types/api";

type AnalystsTableProps = {
  analysts: User[];
};

export function AnalystsTable({ analysts }: AnalystsTableProps) {
  const [sendToast] = useToast();
  const [removeAnalyst] = useRemoveAnalystMutation();

  const handleRemoveAnalyst = useCallback(
    async (userId: number) => {
      try {
        await removeAnalyst(userId).unwrap();
        sendToast({ message: t`Analyst removed` });
      } catch {
        sendToast({ message: t`Failed to remove analyst` });
      }
    },
    [removeAnalyst, sendToast],
  );

  const columns = useMemo<TreeTableColumnDef<User>[]>(
    () => [
      {
        id: "analyst",
        header: t`Analyst`,
        accessorFn: (row) => getFullName(row),
        minWidth: 320,
        maxWidth: 800,
        cell: ({ row }) => (
          <Flex align="center" gap="sm">
            <Box fz="0.75em">
              <UserAvatar user={row.original} />
            </Box>
            <Stack gap={0}>
              <Text fw={500}>{getFullName(row.original) || "-"}</Text>
              <Text c="text-secondary" size="sm">
                {row.original.email}
              </Text>
            </Stack>
          </Flex>
        ),
      },
      {
        id: "lastActive",
        header: t`Last active`,
        accessorKey: "last_login",
        minWidth: "auto",
        widthPadding: 40,
        cell: ({ getValue }) => {
          const value = getValue() as string | null;
          return (
            <Text c="text-secondary">
              {value ? new Date(value).toLocaleDateString() : t`Never`}
            </Text>
          );
        },
      },
      {
        id: "actions",
        header: "",
        width: 48,
        cell: ({ row }) => (
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon variant="subtle" c="text-secondary">
                <FixedSizeIcon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                c="error"
                onClick={() => handleRemoveAnalyst(row.original.id)}
              >
                {t`Remove analyst`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ),
      },
    ],
    [handleRemoveAnalyst],
  );

  const treeTableInstance = useTreeTableInstance({
    data: analysts,
    columns,
    getNodeId: (node) => String(node.id),
  });

  if (analysts.length === 0) {
    return (
      <Box py="xl">
        <Text ta="center" c="text-secondary">
          {t`No analysts yet. Invite people to give them access to Data Studio.`}
        </Text>
      </Box>
    );
  }

  return (
    <Card withBorder p={0}>
      <TreeTable instance={treeTableInstance} />
    </Card>
  );
}
