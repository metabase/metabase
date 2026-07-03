import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import ApiKeysEmptyIllustration from "assets/img/api-keys-empty.svg?component";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useListApiKeysQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Center,
  Ellipsified,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  Title,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";
import { formatDateTimeWithUnit } from "metabase/visualizations/lib/formatting/date";
import type { ApiKey } from "metabase-types/api";

import { CreateApiKeyModal } from "./CreateApiKeyModal";
import { DeleteApiKeyModal } from "./DeleteApiKeyModal";
import { EditApiKeyModal } from "./EditApiKeyModal";
import S from "./ManageApiKeys.module.css";
import { formatMaskedKey } from "./utils";

const { fontFamilyMonospace } = getThemeOverrides();

type Modal = null | "create" | "edit" | "delete";

const getNodeId = (apiKey: ApiKey) => String(apiKey.id);

// TODO: replace with the shared `metabase/common/components/EmptyState` once it's migrated off Emotion (UXW-3641).
function EmptyState() {
  return (
    <Center mih="20rem" data-testid="empty-table-warning">
      <Stack align="center" gap="sm">
        <Box c="text-primary" lh={0}>
          <ApiKeysEmptyIllustration aria-hidden />
        </Box>
        <Text
          c="text-disabled"
          size="sm"
          ta="center"
        >{t`No API keys yet`}</Text>
      </Stack>
    </Center>
  );
}

function ApiKeyActionsMenu({
  apiKey,
  onEdit,
  onDelete,
}: {
  apiKey: ApiKey;
  onEdit: (apiKey: ApiKey) => void;
  onDelete: (apiKey: ApiKey) => void;
}) {
  return (
    <Menu shadow="md" position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          aria-label={t`API key actions`}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <Menu.Item
          leftSection={<Icon name="pencil" />}
          onClick={() => onEdit(apiKey)}
        >
          {t`Edit`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="trash" />}
          onClick={() => onDelete(apiKey)}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function useApiKeyColumns({
  onEdit,
  onDelete,
}: {
  onEdit: (apiKey: ApiKey) => void;
  onDelete: (apiKey: ApiKey) => void;
}): TreeTableColumnDef<ApiKey>[] {
  return useMemo(
    () => [
      {
        id: "name",
        header: t`Key name`,
        minWidth: 140,
        enableSorting: true,
        accessorFn: (apiKey) => apiKey.name,
        cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
      },
      {
        id: "group_name",
        header: t`Group`,
        minWidth: 130,
        enableSorting: true,
        accessorFn: (apiKey) => apiKey.group.name,
        cell: ({ row }) => <Ellipsified>{row.original.group.name}</Ellipsified>,
      },
      {
        id: "masked_key",
        header: t`Key`,
        minWidth: 130,
        enableSorting: false,
        accessorFn: (apiKey) => apiKey.masked_key,
        cell: ({ row }) => (
          <Text ff={fontFamilyMonospace as string}>
            {formatMaskedKey(row.original.masked_key)}
          </Text>
        ),
      },
      {
        id: "updated_by_name",
        header: t`Last modified by`,
        minWidth: 130,
        enableSorting: true,
        accessorFn: (apiKey) => apiKey.updated_by?.common_name ?? "",
        cell: ({ row }) => (
          <Ellipsified>
            {row.original.updated_by?.common_name ?? ""}
          </Ellipsified>
        ),
      },
      {
        id: "updated_at",
        header: t`Last modified on`,
        width: 200,
        enableSorting: true,
        sortDescFirst: true,
        accessorFn: (apiKey) => apiKey.updated_at,
        cell: ({ row }) =>
          formatDateTimeWithUnit(row.original.updated_at, "minute"),
      },
      {
        id: "actions",
        header: "",
        width: 64,
        enableSorting: false,
        cell: ({ row }) => (
          <ApiKeyActionsMenu
            apiKey={row.original}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [onEdit, onDelete],
  );
}

function ApiKeysTable({
  apiKeys,
  onEdit,
  onDelete,
}: {
  apiKeys: ApiKey[];
  onEdit: (apiKey: ApiKey) => void;
  onDelete: (apiKey: ApiKey) => void;
}) {
  const columns = useApiKeyColumns({ onEdit, onDelete });
  const instance = useTreeTableInstance<ApiKey>({
    data: apiKeys,
    columns,
    getNodeId,
    defaultRowHeight: 48,
  });

  const getRowProps = useCallback(
    (row: Row<ApiKey>) => ({
      "data-testid": `api-key-row-${row.original.id}`,
      "aria-label": row.original.name,
    }),
    [],
  );

  const handleRowClick = useCallback(
    (row: Row<ApiKey>) => onEdit(row.original),
    [onEdit],
  );

  return (
    <Box data-testid="api-keys-table">
      <TreeTable
        instance={instance}
        hierarchical={false}
        headerVariant="pill"
        ariaLabel={t`API keys`}
        getRowProps={getRowProps}
        onRowClick={handleRowClick}
        classNames={{ cell: S.cell, row: S.row }}
      />
    </Box>
  );
}

export const ManageApiKeys = () => {
  const [modal, setModal] = useState<Modal>(null);
  const [activeApiKey, setActiveApiKey] = useState<null | ApiKey>(null);

  const { data: apiKeys, error, isLoading } = useListApiKeysQuery();

  const sortedApiKeys = useMemo(() => {
    if (!apiKeys) {
      return [];
    }
    return [...apiKeys].sort((a, b) => a.name.localeCompare(b.name));
  }, [apiKeys]);

  const handleClose = () => setModal(null);
  const handleEdit = useCallback((apiKey: ApiKey) => {
    setActiveApiKey(apiKey);
    setModal("edit");
  }, []);
  const handleDelete = useCallback((apiKey: ApiKey) => {
    setActiveApiKey(apiKey);
    setModal("delete");
  }, []);

  const hasKeys = sortedApiKeys.length > 0;
  const showLoadingOrError = isLoading || Boolean(error);

  return (
    <SettingsPageWrapper>
      <ApiKeyModals
        onClose={handleClose}
        modal={modal}
        activeApiKey={activeApiKey}
      />
      <Group
        justify="space-between"
        align="flex-start"
        gap="xl"
        data-testid="api-keys-settings-header"
      >
        <Box>
          <Title order={1}>{t`API keys`}</Title>
          <Text c="text-secondary" maw="40rem">
            {t`Create API keys to let users authenticate API calls or make them programmatically.`}
          </Text>
        </Box>
        <Button variant="filled" onClick={() => setModal("create")}>
          {t`Create an API key`}
        </Button>
      </Group>
      <Card withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
        {showLoadingOrError ? (
          <Box p="xl" mih="20rem">
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Box>
        ) : hasKeys ? (
          <ApiKeysTable
            apiKeys={sortedApiKeys}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : (
          <EmptyState />
        )}
      </Card>
    </SettingsPageWrapper>
  );
};

function ApiKeyModals({
  onClose,
  modal,
  activeApiKey,
}: {
  onClose: () => void;
  modal: Modal;
  activeApiKey: ApiKey | null;
}) {
  if (modal === "create") {
    return <CreateApiKeyModal onClose={onClose} />;
  }

  if (modal === "edit" && activeApiKey) {
    return <EditApiKeyModal onClose={onClose} apiKey={activeApiKey} />;
  }

  if (modal === "delete" && activeApiKey) {
    return <DeleteApiKeyModal apiKey={activeApiKey} onClose={onClose} />;
  }

  return null;
}
