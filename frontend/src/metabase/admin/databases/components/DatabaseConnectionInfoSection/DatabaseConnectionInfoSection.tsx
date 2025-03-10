import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  useGetDatabaseHealthQuery,
  useRescanDatabaseFieldValuesMutation,
  useSyncDatabaseSchemaMutation,
} from "metabase/api";
import ActionButton from "metabase/components/ActionButton";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Badge, Button, Flex, Text, Tooltip } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId } from "metabase-types/api";

import { isDbModifiable } from "../../utils";
import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "../DatabaseInfoSection";

import S from "./DatabaseConnectionInfoSection.module.css";

export const DatabaseConnectionInfoSection = ({
  database,
  dismissSyncSpinner,
}: {
  database: Database;
  dismissSyncSpinner: (databaseId: DatabaseId) => Promise<void>;
}) => {
  const isSynced = isSyncCompleted(database);

  const dispatch = useDispatch();
  const [syncDatabaseSchema] = useSyncDatabaseSchemaMutation();
  const [rescanDatabaseFieldValues] = useRescanDatabaseFieldValuesMutation();

  const handleSyncDatabaseSchema = async () => {
    await syncDatabaseSchema(database.id);
    // FIXME remove when MetadataEditor uses RTK query directly to load tables
    dispatch({ type: Tables.actionTypes.INVALIDATE_LISTS_ACTION });
  };

  const handleDismissSyncSpinner = useCallback(
    () => dismissSyncSpinner(database.id),
    [database.id, dismissSyncSpinner],
  );

  const openDbDetailsModal = useCallback(() => {
    dispatch(push(`/admin/databases/${database.id}/edit`));
  }, [database.id, dispatch]);

  const healthQuery = useGetDatabaseHealthQuery(database.id);
  const health = useMemo(() => {
    return match(healthQuery)
      .with(
        { currentData: { status: "ok" } },
        () => ({ message: t`Connected`, color: "success" }) as const,
      )
      .with(
        { isUninitialized: true },
        { isFetching: true },
        { isLoading: true },
        () => ({ message: t`Loading...`, color: "text-light" }) as const,
      )
      .with(
        { currentData: { status: "error" } },
        q => ({ message: q.currentData.message, color: "danger" }) as const,
      )
      .with(
        { isError: true },
        () =>
          ({
            message: t`Failed to retrieve database health status.`,
            color: "text-light",
          }) as const,
      )
      .exhaustive();
  }, [healthQuery]);

  return (
    <DatabaseInfoSection
      condensed
      name={t`Connection and sync`}
      description={t`Manage details about the database connection and when Metabase ingests new data.`}
      data-testid="database-connection-info-section"
    >
      <Flex align="center" justify="space-between" gap="lg">
        <Flex align="center" gap="sm">
          <Badge size="12" circle bg={health.color} style={{ flexShrink: 0 }} />
          <Text lh="1.4">{health.message}</Text>
        </Flex>
        <Tooltip
          disabled={isDbModifiable(database)}
          label={t`This database is managed by Metabase Cloud and cannot be modified.`}
        >
          <Button
            onClick={openDbDetailsModal}
            style={{ flexShrink: 0 }}
            disabled={!isDbModifiable(database)}
          >{t`Edit connection details`}</Button>
        </Tooltip>
      </Flex>

      <DatabaseInfoSectionDivider />

      <Flex gap="sm" wrap="wrap">
        {!isSynced && <Button disabled>{t`Syncing database…`}</Button>}
        <ActionButton
          className={S.actionButton}
          actionFn={handleSyncDatabaseSchema}
          normalText={t`Sync database schema`}
          activeText={t`Starting…`}
          failedText={t`Failed to sync`}
          successText={t`Sync triggered!`}
        />
        <ActionButton
          className={S.actionButton}
          actionFn={() => rescanDatabaseFieldValues(database.id)}
          normalText={t`Re-scan field values`}
          activeText={t`Starting…`}
          failedText={t`Failed to start scan`}
          successText={t`Scan triggered!`}
        />
        {!isSynced && (
          <ActionButton
            className={S.actionButton}
            actionFn={handleDismissSyncSpinner}
            normalText={t`Dismiss sync spinner manually`}
            activeText={t`Dismissing…`}
            failedText={t`Failed to dismiss sync spinner`}
            successText={t`Sync spinners dismissed!`}
          />
        )}
      </Flex>
    </DatabaseInfoSection>
  );
};
