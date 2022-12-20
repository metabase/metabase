import React, { useCallback, useRef } from "react";
import { t } from "ttag";

import { isSyncCompleted } from "metabase/lib/syncing";
import DeleteDatabaseModal from "metabase/admin/databases/components/DeleteDatabaseModal.jsx";
import ActionButton from "metabase/components/ActionButton";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import ConfirmContent from "metabase/components/ConfirmContent";
import Button from "metabase/core/components/Button";

import type { DatabaseId } from "metabase-types/api";
import type Database from "metabase-lib/metadata/Database";

import ModelCachingControl from "./ModelCachingControl";
import {
  SidebarRoot,
  SidebarContent,
  SidebarGroup,
  SidebarGroupName,
} from "./Sidebar.styled";

interface DatabaseEditAppSidebarProps {
  database: Database;
  isAdmin: boolean;
  isModelPersistenceEnabled: boolean;
  updateDatabase: (database: Database) => void;
  syncDatabaseSchema: (databaseId: DatabaseId) => void;
  dismissSyncSpinner: (databaseId: DatabaseId) => void;
  rescanDatabaseFields: (databaseId: DatabaseId) => void;
  discardSavedFieldValues: (databaseId: DatabaseId) => void;
  deleteDatabase: (databaseId: DatabaseId, isDetailView: boolean) => void;
}

const DatabaseEditAppSidebar = ({
  database,
  deleteDatabase,
  syncDatabaseSchema,
  dismissSyncSpinner,
  rescanDatabaseFields,
  discardSavedFieldValues,
  isAdmin,
  isModelPersistenceEnabled,
}: DatabaseEditAppSidebarProps) => {
  const discardSavedFieldValuesModal = useRef<any>();
  const deleteDatabaseModal = useRef<any>();

  const isSynced = isSyncCompleted(database);
  const hasModelCachingSection =
    isModelPersistenceEnabled && database.supportsPersistence();

  const handleSyncDatabaseSchema = useCallback(
    () => syncDatabaseSchema(database.id),
    [database, syncDatabaseSchema],
  );

  const handleReScanFieldValues = useCallback(
    () => rescanDatabaseFields(database.id),
    [database, rescanDatabaseFields],
  );

  const handleDismissSyncSpinner = useCallback(
    () => dismissSyncSpinner(database.id),
    [database, dismissSyncSpinner],
  );

  const handleDiscardSavedFieldValues = useCallback(
    () => discardSavedFieldValues(database.id),
    [database, discardSavedFieldValues],
  );

  const handleDeleteDatabase = useCallback(
    () => deleteDatabase(database.id, true),
    [database, deleteDatabase],
  );

  const handleSavedFieldsModalClose = useCallback(() => {
    discardSavedFieldValuesModal.current.close();
  }, []);

  const handleDeleteDatabaseModalClose = useCallback(() => {
    deleteDatabaseModal.current.close();
  }, []);

  return (
    <SidebarRoot>
      <SidebarContent data-testid="database-actions-panel">
        <SidebarGroup>
          <SidebarGroupName>{t`Actions`}</SidebarGroupName>
          <ol>
            {!isSynced && (
              <li>
                <Button disabled borderless>{t`Syncing database…`}</Button>
              </li>
            )}
            <li>
              <ActionButton
                actionFn={handleSyncDatabaseSchema}
                normalText={t`Sync database schema now`}
                activeText={t`Starting…`}
                failedText={t`Failed to sync`}
                successText={t`Sync triggered!`}
              />
            </li>
            <li className="mt2">
              <ActionButton
                actionFn={handleReScanFieldValues}
                normalText={t`Re-scan field values now`}
                activeText={t`Starting…`}
                failedText={t`Failed to start scan`}
                successText={t`Scan triggered!`}
              />
            </li>
            {!isSynced && (
              <li className="mt2">
                <ActionButton
                  actionFn={handleDismissSyncSpinner}
                  normalText={t`Dismiss sync spinner manually`}
                  activeText={t`Dismissing…`}
                  failedText={t`Failed to dismiss sync spinner`}
                  successText={t`Sync spinners dismissed!`}
                />
              </li>
            )}
            {hasModelCachingSection && (
              <li className="mt2">
                <ModelCachingControl database={database} />
              </li>
            )}
          </ol>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupName>{t`Danger Zone`}</SidebarGroupName>
          <ol>
            {isSyncCompleted(database) && (
              <li>
                <ModalWithTrigger
                  ref={discardSavedFieldValuesModal}
                  triggerClasses="Button Button--danger"
                  triggerElement={t`Discard saved field values`}
                >
                  <ConfirmContent
                    title={t`Discard saved field values`}
                    onClose={handleSavedFieldsModalClose}
                    onAction={handleDiscardSavedFieldValues}
                  />
                </ModalWithTrigger>
              </li>
            )}
            {isAdmin && (
              <li className="mt2">
                <ModalWithTrigger
                  ref={deleteDatabaseModal}
                  triggerClasses="Button Button--danger"
                  triggerElement={t`Remove this database`}
                >
                  <DeleteDatabaseModal
                    database={database}
                    onClose={handleDeleteDatabaseModalClose}
                    onDelete={handleDeleteDatabase}
                  />
                </ModalWithTrigger>
              </li>
            )}
          </ol>
        </SidebarGroup>
      </SidebarContent>
    </SidebarRoot>
  );
};

export default DatabaseEditAppSidebar;
