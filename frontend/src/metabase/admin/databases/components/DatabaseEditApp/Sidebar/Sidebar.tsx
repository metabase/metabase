import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import DeleteDatabaseModal from "metabase/admin/databases/components/DeleteDatabaseModel/DeleteDatabaseModal";
import {
  useDiscardDatabaseFieldValuesMutation,
  useRescanDatabaseFieldValuesMutation,
  useSyncDatabaseSchemaMutation,
} from "metabase/api";
import ActionButton from "metabase/components/ActionButton";
import { ConfirmationModal } from "metabase/components/ConfirmationModal";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import OldButton from "metabase/core/components/Button";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Button } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseData, DatabaseId } from "metabase-types/api";

import ModelActionsSection from "./ModelActionsSection";
import ModelCachingControl from "./ModelCachingControl";
import {
  ModelActionsSidebarContent,
  SidebarContent,
  SidebarGroup,
  SidebarRoot,
} from "./Sidebar.styled";

interface DatabaseEditAppSidebarProps {
  database: Database;
  isAdmin: boolean;
  isModelPersistenceEnabled: boolean;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseData>,
  ) => Promise<void>;
  dismissSyncSpinner: (databaseId: DatabaseId) => Promise<void>;
  deleteDatabase: (
    databaseId: DatabaseId,
    isDetailView: boolean,
  ) => Promise<void>;
}

const DatabaseEditAppSidebar = ({
  database,
  updateDatabase,
  deleteDatabase,
  dismissSyncSpinner,
  isAdmin,
  isModelPersistenceEnabled,
}: DatabaseEditAppSidebarProps) => {
  const deleteDatabaseModal = useRef<any>();
  const isEditingDatabase = !!database.id;
  const isSynced = isSyncCompleted(database);
  const hasModelActionsSection =
    isEditingDatabase && database.supportsActions();
  const hasModelCachingSection =
    isModelPersistenceEnabled && database.supportsPersistence();

  const dispatch = useDispatch();
  const [syncDatabaseSchema] = useSyncDatabaseSchemaMutation();
  const [rescanDatabaseFieldValues] = useRescanDatabaseFieldValuesMutation();
  const [discardDatabaseFieldValues] = useDiscardDatabaseFieldValuesMutation();

  const handleSyncDatabaseSchema = async () => {
    await syncDatabaseSchema(database.id);
    // FIXME remove when MetadataEditor uses RTK query directly to load tables
    dispatch({ type: Tables.actionTypes.INVALIDATE_LISTS_ACTION });
  };

  const handleDismissSyncSpinner = useCallback(
    () => dismissSyncSpinner(database.id),
    [database.id, dismissSyncSpinner],
  );

  const handleToggleModelActionsEnabled = useCallback(
    (nextValue: boolean) =>
      updateDatabase({
        id: database.id,
        settings: { "database-enable-actions": nextValue },
      }),
    [database.id, updateDatabase],
  );

  const handleDeleteDatabase = useCallback(
    () => deleteDatabase(database.id, true),
    [database.id, deleteDatabase],
  );

  const handleDeleteDatabaseModalClose = useCallback(() => {
    deleteDatabaseModal.current.close();
  }, []);

  const [discardModalIsOpen, setDiscardModalIsOpen] = useState(false);
  const handleOpenDiscardModal = () => setDiscardModalIsOpen(true);
  const handleCloseDiscardModal = () => setDiscardModalIsOpen(false);

  return (
    <SidebarRoot>
      <SidebarContent data-testid="database-actions-panel">
        <SidebarGroup>
          <SidebarGroup.List>
            {!isSynced && (
              <SidebarGroup.ListItem hasMarginTop={false}>
                <OldButton
                  disabled
                  borderless
                >{t`Syncing database…`}</OldButton>
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
                actionFn={() => rescanDatabaseFieldValues(database.id)}
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
                <Button
                  variant="filled"
                  color="danger"
                  onClick={handleOpenDiscardModal}
                >
                  {t`Discard saved field values`}
                </Button>
                <ConfirmationModal
                  opened={discardModalIsOpen}
                  title={t`Discard saved field values`}
                  onClose={handleCloseDiscardModal}
                  onConfirm={() => {
                    discardDatabaseFieldValues(database.id);
                    handleCloseDiscardModal();
                  }}
                />
              </SidebarGroup.ListItem>
            )}
            {isAdmin && (
              <SidebarGroup.ListItem>
                <ModalWithTrigger
                  triggerElement={
                    <OldButton danger>{t`Remove this database`}</OldButton>
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
      {hasModelActionsSection && (
        <ModelActionsSidebarContent>
          <ModelActionsSection
            hasModelActionsEnabled={database.hasActionsEnabled()}
            onToggleModelActionsEnabled={handleToggleModelActionsEnabled}
          />
        </ModelActionsSidebarContent>
      )}
    </SidebarRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseEditAppSidebar;
