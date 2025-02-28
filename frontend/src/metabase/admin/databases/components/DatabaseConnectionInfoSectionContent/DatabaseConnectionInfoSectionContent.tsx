import { useCallback } from "react";
import { t } from "ttag";

import {
  useRescanDatabaseFieldValuesMutation,
  useSyncDatabaseSchemaMutation,
} from "metabase/api";
import ActionButton from "metabase/components/ActionButton";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Box, Button, Flex, Text } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId } from "metabase-types/api";

import { DatabaseInfoSectionDivider } from "../DatabaseInfoSection";

import S from "./DatabaseConnectionInfoSectionContent.module.css";

export const DatabaseConnectionInfoSectionContent = ({
  database,
  dismissSyncSpinner,
  openDbDetailsModal,
}: {
  database: Database;
  dismissSyncSpinner: (databaseId: DatabaseId) => Promise<void>;
  openDbDetailsModal: () => void;
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

  // TODO: handle fetching connection status info once endpoint exists

  return (
    <>
      <Flex align="center" justify="space-between">
        <Flex align="center" gap="xs">
          <Box
            w=".75rem"
            h=".75rem"
            style={{
              borderRadius: "50%",
              background: "var(--mb-color-success)",
            }}
          />
          <Text c="black">{t`No connection issues`}</Text>
        </Flex>
        <Button onClick={openDbDetailsModal}>{t`Edit`}</Button>
      </Flex>

      <DatabaseInfoSectionDivider />

      <Flex gap="sm">
        {!isSynced && <Button disabled>{t`Syncing database…`}</Button>}
        <ActionButton
          className={S.actionButton}
          actionFn={handleSyncDatabaseSchema}
          normalText={t`Sync database schema now`}
          activeText={t`Starting…`}
          failedText={t`Failed to sync`}
          successText={t`Sync triggered!`}
        />
        <ActionButton
          className={S.actionButton}
          actionFn={() => rescanDatabaseFieldValues(database.id)}
          normalText={t`Re-scan field values now`}
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
    </>
  );
};
