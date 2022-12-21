import React, { useCallback, useRef } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ActionButton from "metabase/components/ActionButton";
import ConfirmContent from "metabase/components/ConfirmContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { isSyncCompleted } from "metabase/lib/syncing";
import DeleteDatabaseModal from "metabase/admin/databases/components/DeleteDatabaseModal.jsx";

import type { DatabaseId } from "metabase-types/api";
import type Database from "metabase-lib/metadata/Database";

import ModelCachingControl from "./ModelCachingControl";
import { SidebarRoot, SidebarContent, SidebarGroup } from "./Sidebar.styled";

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
          <SidebarGroup.Name>{t`Actions`}</SidebarGroup.Name>
          <SidebarGroup.List>
            {!isSynced && (
              <SidebarGroup.ListItem hasMarginTop={false}>
                <Button disabled borderless>{t`Syncing database…`}</Button>
              </SidebarGroup.ListItem>
            )}
            <SidebarGroup.ListItem hasMarginTop={false}>
              <ActionButton
                actionFn={handleSyncDatabaseSchema}
                normalText={t`Sync database schema now`}
                activeText={t`Starting…`}
                failedText={t`Failed to sync`}
                successText={t`Sync triggered!`}
              />
            </SidebarGroup.ListItem>
            <SidebarGroup.ListItem>
              <ActionButton
                actionFn={handleReScanFieldValues}
                normalText={t`Re-scan field values now`}
                activeText={t`Starting…`}
                failedText={t`Failed to start scan`}
                successText={t`Scan triggered!`}
              />
            </SidebarGroup.ListItem>
            {!isSynced && (
              <SidebarGroup.ListItem>
                <ActionButton
                  actionFn={handleDismissSyncSpinner}
                  normalText={t`Dismiss sync spinner manually`}
                  activeText={t`Dismissing…`}
                  failedText={t`Failed to dismiss sync spinner`}
                  successText={t`Sync spinners dismissed!`}
                />
              </SidebarGroup.ListItem>
            )}
            {hasModelCachingSection && (
              <SidebarGroup.ListItem>
                <ModelCachingControl database={database} />
              </SidebarGroup.ListItem>
            )}
          </SidebarGroup.List>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroup.Name>{t`Danger Zone`}</SidebarGroup.Name>
          <SidebarGroup.List>
            {isSyncCompleted(database) && (
              <SidebarGroup.ListItem hasMarginTop={false}>
                <ModalWithTrigger
                  triggerElement={
                    <Button danger>{t`Discard saved field values`}</Button>
                  }
                  ref={discardSavedFieldValuesModal}
                >
                  <ConfirmContent
                    title={t`Discard saved field values`}
                    onClose={handleSavedFieldsModalClose}
                    onAction={handleDiscardSavedFieldValues}
                  />
                </ModalWithTrigger>
              </SidebarGroup.ListItem>
            )}
            {isAdmin && (
              <SidebarGroup.ListItem>
                <ModalWithTrigger
                  triggerElement={
                    <Button danger>{t`Remove this database`}</Button>
                  }
                  ref={deleteDatabaseModal}
                >
                  <DeleteDatabaseModal
                    database={database}
                    onClose={handleDeleteDatabaseModalClose}
                    onDelete={handleDeleteDatabase}
                  />
                </ModalWithTrigger>
              </SidebarGroup.ListItem>
            )}
          </SidebarGroup.List>
        </SidebarGroup>
      </SidebarContent>
    </SidebarRoot>
  );
};

export default DatabaseEditAppSidebar;
