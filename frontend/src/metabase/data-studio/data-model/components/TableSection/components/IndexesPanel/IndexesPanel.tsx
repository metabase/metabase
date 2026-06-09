import { skipToken } from "@reduxjs/toolkit/query";
import { useState } from "react";
import { t } from "ttag";

import {
  useDeleteTableIndexRequestMutation,
  useGetDatabaseQuery,
  useListTableIndexesQuery,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Alert,
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
} from "metabase/ui";
import type { IndexInfo, Table } from "metabase-types/api";

import { IndexForm } from "./IndexForm";
import { IndexesList } from "./IndexesList";
import S from "./IndexesPanel.module.css";
import type { FormMode } from "./types";

interface Props {
  table: Table;
}

export function IndexesPanel({ table }: Props) {
  const [mode, setMode] = useState<FormMode>({ kind: "list" });
  const [dropTarget, setDropTarget] = useState<IndexInfo | null>(null);

  const { data, isLoading, error, refetch } = useListTableIndexesQuery(
    table.id,
  );
  const { data: database } = useGetDatabaseQuery(
    table.db_id != null ? { id: table.db_id } : skipToken,
  );
  const [dropIndex, dropResult] = useDeleteTableIndexRequestMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const driverSupported = data?.table.driver_supported ?? true;
  const canManage = data?.table.can_manage ?? driverSupported;

  const handleEdit = (index: IndexInfo) => {
    setMode({
      kind: "edit",
      requestId: index.request?.id ?? null,
      existing: index,
    });
  };

  const handleDropConfirm = async () => {
    if (!dropTarget?.request) {
      // Warehouse-only indexes have no IndexRequest row; the drop endpoint
      // expects a request id, so we can't issue the call yet. The backend
      // needs a drop-by-name path or auto-adoption during introspection.
      sendErrorToast(
        t`Can't drop this index yet — it isn't tracked by an index request.`,
      );
      setDropTarget(null);
      return;
    }
    const result = await dropIndex({
      tableId: table.id,
      requestId: dropTarget.request.id,
    });
    if ("error" in result && result.error) {
      sendErrorToast(t`Failed to drop ${dropTarget.name}`);
      return;
    }
    sendSuccessToast(t`Dropping ${dropTarget.name}…`);
    setDropTarget(null);
    refetch();
  };

  if (!driverSupported) {
    return (
      <Box py="lg">
        <Alert color="brand" icon={<Icon name="info" />}>
          {t`Index management is only available for Postgres tables in this release.`}
        </Alert>
      </Box>
    );
  }

  if (mode.kind !== "list") {
    return (
      <Stack gap="md" data-testid="index-form-view">
        <Group justify="space-between" align="center">
          <Text className={S.formTitle}>
            {mode.kind === "edit" ? t`Edit index` : t`Create index`}
          </Text>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<Icon name="chevronleft" size={12} />}
            onClick={() => setMode({ kind: "list" })}
          >
            {t`Back`}
          </Button>
        </Group>
        <IndexForm
          mode={mode}
          table={table}
          database={database}
          onCancel={() => setMode({ kind: "list" })}
          onSubmitted={() => {
            setMode({ kind: "list" });
            refetch();
          }}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="md" data-testid="indexes-panel">
      <Box className={S.header}>
        <Box className={S.headerTitle}>
          <Text className={S.title}>{t`Indexes`}</Text>
          <Text className={S.subtitle}>{t`Manage indexes on this table.`}</Text>
        </Box>
        {canManage && (
          <Button
            size="xs"
            style={{ flexShrink: 0 }}
            leftSection={<Icon name="add" size={12} />}
            onClick={() => setMode({ kind: "create" })}
          >
            {t`Add index`}
          </Button>
        )}
      </Box>

      {isLoading && (
        <Group gap="xs">
          <Loader size="xs" />
          <Text c="text-secondary" size="sm">{t`Loading indexes…`}</Text>
        </Group>
      )}

      {Boolean(error) && !isLoading && (
        <Alert color="error" icon={<Icon name="warning" />}>
          {t`Couldn't load indexes.`}
        </Alert>
      )}

      {!isLoading && !error && (
        <IndexesList
          indexes={data?.indexes ?? []}
          canManage={canManage}
          onEdit={handleEdit}
          onDrop={setDropTarget}
        />
      )}

      <ConfirmModal
        opened={dropTarget != null}
        title={t`Drop index ${dropTarget?.name ?? ""}?`}
        message={t`This will issue DROP INDEX on the warehouse and remove tracking for it. This action cannot be undone.`}
        confirmButtonText={t`Drop index`}
        confirmButtonProps={{ loading: dropResult.isLoading }}
        onConfirm={handleDropConfirm}
        onClose={() => setDropTarget(null)}
      />
    </Stack>
  );
}
