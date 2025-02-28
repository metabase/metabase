import { useCallback } from "react";

import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseData, DatabaseId } from "metabase-types/api";

import ModelActionsSection from "./ModelActionsSection";
import ModelCachingControl from "./ModelCachingControl";

export const DatabaseModelFeaturesSectionContent = ({
  database,
  isModelPersistenceEnabled,
  updateDatabase,
}: {
  database: Database;
  isModelPersistenceEnabled: boolean;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseData>,
  ) => Promise<void>;
}) => {
  const isEditingDatabase = !!database.id;

  const hasModelActionsSection =
    isEditingDatabase && database.supportsActions();
  const hasModelCachingSection =
    isModelPersistenceEnabled && database.supportsPersistence();

  const handleToggleModelActionsEnabled = useCallback(
    (nextValue: boolean) =>
      updateDatabase({
        id: database.id,
        settings: { "database-enable-actions": nextValue },
      }),
    [database.id, updateDatabase],
  );

  return (
    <>
      {hasModelActionsSection && (
        <ModelActionsSection
          hasModelActionsEnabled={database.hasActionsEnabled()}
          onToggleModelActionsEnabled={handleToggleModelActionsEnabled}
        />
      )}

      {hasModelCachingSection && <ModelCachingControl database={database} />}
    </>
  );
};
