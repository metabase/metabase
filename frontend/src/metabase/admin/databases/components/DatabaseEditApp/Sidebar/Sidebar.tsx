import { useCallback } from "react";
import { t } from "ttag";

import {
  useRescanDatabaseFieldValuesMutation,
  useSyncDatabaseSchemaMutation,
} from "metabase/api";
import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/core/components/Button";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
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
}

const DatabaseEditAppSidebar = ({
  database,
  updateDatabase,
  dismissSyncSpinner,
  isModelPersistenceEnabled,
}: DatabaseEditAppSidebarProps) => {
  const isEditingDatabase = !!database.id;
  const isSynced = isSyncCompleted(database);
  const hasModelActionsSection =
    isEditingDatabase && database.supportsActions();
  const hasModelCachingSection =
    isModelPersistenceEnabled && database.supportsPersistence();

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

  const handleToggleModelActionsEnabled = useCallback(
    (nextValue: boolean) =>
      updateDatabase({
        id: database.id,
        settings: { "database-enable-actions": nextValue },
      }),
    [database.id, updateDatabase],
  );

  return (
    <SidebarRoot>
      <SidebarContent data-testid="database-actions-panel">
        <SidebarGroup>
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
