import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useUpdateUserMutation } from "metabase/api";
import UserAvatar from "metabase/common/components/UserAvatar";
import { useToast } from "metabase/common/hooks";
import { getFullName } from "metabase/lib/user";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  ActionIcon,
  Badge,
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
  const [updateUser] = useUpdateUserMutation();

  const handleToggleAnalystAccess = useCallback(
    async (userId: number, grantAccess: boolean) => {
      try {
        await updateUser({ id: userId, is_data_analyst: grantAccess }).unwrap();
        sendToast({
          message: grantAccess
            ? t`Analyst access granted`
            : t`Analyst access revoked`,
        });
      } catch {
        sendToast({
          message: grantAccess
            ? t`Failed to grant analyst access`
            : t`Failed to revoke analyst access`,
        });
      }
    },
    [updateUser, sendToast],
  );

  const columns = useMemo<TreeTableColumnDef<User>[]>(
    () => [
      {
        id: "user",
        header: t`User`,
        accessorFn: (row) => getFullName(row),
        minWidth: 320,
        maxWidth: 800,
        cell: ({ row }) => (
          <Flex align="center" gap="sm">
            <Box fz="0.75em">
              <UserAvatar user={row.original} />
            </Box>
            <Stack gap={0}>
              <Text lh="1.4rem" fw={500}>
                {getFullName(row.original) || "-"}
              </Text>
              <Text c="text-secondary" size="sm">
                {row.original.email}
              </Text>
            </Stack>
          </Flex>
        ),
      },
      {
        id: "access",
        header: t`Access`,
        accessorFn: (row) => row.is_data_analyst,
        minWidth: "auto",
        widthPadding: 20,
        cell: ({ row }) => (
          <Badge
            variant="light"
            color={row.original.is_data_analyst ? "brand" : "text-light"}
          >
            {row.original.is_data_analyst ? t`Analyst` : t`Basic`}
          </Badge>
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
        cell: ({ row }) => {
          const isAnalyst = row.original.is_data_analyst;
          return (
            <Menu position="bottom-end" shadow="md">
              <Menu.Target>
                <ActionIcon variant="subtle" c="text-secondary">
                  <FixedSizeIcon name="ellipsis" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  c={isAnalyst ? "error" : undefined}
                  onClick={() =>
                    handleToggleAnalystAccess(row.original.id, !isAnalyst)
                  }
                >
                  {isAnalyst
                    ? t`Revoke analyst access`
                    : t`Grant analyst access`}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          );
        },
      },
    ],
    [handleToggleAnalystAccess],
  );

  const treeTableInstance = useTreeTableInstance({
    data: analysts,
    columns,
    getNodeId: (node) => String(node.id),
    defaultRowHeight: 56,
  });

  if (analysts.length === 0) {
    return (
      <Box py="xl">
        <Text ta="center" c="text-secondary">
          {t`No users with Data Studio access yet. Invite people to give them access.`}
        </Text>
      </Box>
    );
  }

  return (
    <Card withBorder p={0}>
      <TreeTable instance={treeTableInstance} rowHeight={56} />
    </Card>
  );
}
