import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  useDismissDatabaseSyncSpinnerMutation,
  useRescanDatabaseFieldValuesMutation,
  useSyncDatabaseSchemaMutation,
} from "metabase/api";
import { ActionButton } from "metabase/common/components/ActionButton";
import { Tables } from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Button, Flex, Tooltip } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { isDbModifiable } from "../../utils";
import { DatabaseConnectionHealthInfo } from "../DatabaseConnectionHealthInfo";
import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "../DatabaseInfoSection";

import S from "./DatabaseConnectionInfoSection.module.css";

export const DatabaseConnectionInfoSection = ({
  database,
}: {
  database: Database;
}) => {
  const isSynced = isSyncCompleted(database);

  const dispatch = useDispatch();
  const [syncDatabaseSchema] = useSyncDatabaseSchemaMutation();
  const [rescanDatabaseFieldValues] = useRescanDatabaseFieldValuesMutation();
  const [dismissSyncSpinner] = useDismissDatabaseSyncSpinnerMutation();

  const handleSyncDatabaseSchema = async () => {
    await syncDatabaseSchema(database.id).unwrap();
    // FIXME remove when MetadataEditor uses RTK query directly to load tables
    dispatch({ type: Tables.actionTypes.INVALIDATE_LISTS_ACTION });
  };

  const handleDismissSyncSpinner = useCallback(
    () => dismissSyncSpinner(database.id).unwrap(),
    [database.id, dismissSyncSpinner],
  );

  const openDbDetailsModal = useCallback(() => {
    dispatch(push(`/admin/databases/${database.id}/edit`));
  }, [database.id, dispatch]);

  return (
    <DatabaseInfoSection
      condensed
      name={t`Connection and sync`}
      description={t`Manage details about the database connection and when Metabase ingests new data.`}
      data-testid="database-connection-info-section"
    >
      <Flex align="center" justify="space-between" gap="lg">
        <DatabaseConnectionHealthInfo databaseId={database.id} />
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

      <DatabaseInfoSectionDivider condensed />

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
          actionFn={() => rescanDatabaseFieldValues(database.id).unwrap()}
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
