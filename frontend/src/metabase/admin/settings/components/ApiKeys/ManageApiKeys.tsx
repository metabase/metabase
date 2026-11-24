import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import ApiKeysEmptyIllustration from "assets/img/api-keys-empty.svg?component";
import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { MeasuredSkeleton } from "metabase/common/components/Skeletons";
import { SettingsPageWrapper } from "metabase/settings-components";
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
  Text,
  Title,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { formatDateTimeWithUnit } from "metabase/value-formatting";
import type { ApiKey } from "metabase-types/api";

import { useListApiKeysQuery } from "../../api/api-key";

import { CreateApiKeyModal } from "./CreateApiKeyModal";
import { DeleteApiKeyModal } from "./DeleteApiKeyModal";
import { EditApiKeyModal } from "./EditApiKeyModal";
import S from "./ManageApiKeys.module.css";
import { formatMaskedKey } from "./utils";

type Modal = null | "create" | "edit" | "delete";

const getNodeId = (apiKey: ApiKey) => String(apiKey.id);

// Typical keys, so a first visit's skeleton has realistic line lengths.
// Later visits draw the table's shape as last shown.
const SAMPLE_API_KEYS: ApiKey[] = [
  { name: "Production ETL", group: "Administrators", author: "Maria Chen" },
  { name: "Slack reporting bot", group: "Marketing", author: "James Okafor" },
  { name: "dbt Cloud sync", group: "Data team", author: "Priya Raman" },
  { name: "Embedding service", group: "All Users", author: "Maria Chen" },
].map(({ name, group, author }, index) => ({
  id: -(index + 1),
  name,
  group: { id: -(index + 1), name: group },
  creator_id: -1,
  masked_key: "mb_x7Rk****",
  created_at: "2026-10-14T16:32:00Z",
  updated_at: "2026-10-14T16:32:00Z",
  updated_by: { id: -1, common_name: author },
}));

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
    <Menu shadow="sm" position="bottom-end">
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
          <Text ff="var(--mb-default-monospace-font-family)">
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
        gap="xxl"
        data-testid="api-keys-settings-header"
      >
        <Box>
          <Title order={1}>{t`API keys`}</Title>
          <Text c="text-secondary" maw="40rem">
            {t`Create API keys to let users authenticate API calls or make them programmatically.`}
          </Text>
        </Box>
        <Group gap="sm">
          <Button
            variant="subtle"
            component={ForwardRefLink}
            to={Urls.monitorApiKeyUsage()}
            leftSection={<Icon name="key" />}
          >
            {t`View API key usage`}
          </Button>
          <Button variant="filled" onClick={() => setModal("create")}>
            {t`Create an API key`}
          </Button>
        </Group>
      </Group>
      <Card withBorder radius="sm" p={0} style={{ overflow: "hidden" }}>
        {error ? (
          <Box p="xxl" mih="20rem">
            <DelayedLoadingAndErrorWrapper loading={false} error={error} />
          </Box>
        ) : (
          <MeasuredSkeleton
            loading={isLoading}
            id="admin-api-keys"
            classic={
              <Box p="xxl" mih="20rem">
                <DelayedLoadingAndErrorWrapper loading error={null} />
              </Box>
            }
          >
            {isLoading || hasKeys ? (
              <ApiKeysTable
                apiKeys={isLoading ? SAMPLE_API_KEYS : sortedApiKeys}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ) : (
              <Center mih="20rem" data-testid="empty-table-warning">
                <EmptyState
                  illustrationElement={
                    <Box c="text-primary" lh={0}>
                      <ApiKeysEmptyIllustration aria-hidden />
                    </Box>
                  }
                  message={t`No API keys yet`}
                  spacing="sm"
                />
              </Center>
            )}
          </MeasuredSkeleton>
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
