import { useCallback } from "react";
import { t } from "ttag";

import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseData, DatabaseId } from "metabase-types/api";

import { DatabaseInfoSection } from "../DatabaseInfoSection";

import ModelActionsSection from "./ModelActionsSection";
import ModelCachingControl from "./ModelCachingControl";

export const DatabaseModelFeaturesSection = ({
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
  const hasNoContent = [hasModelActionsSection, hasModelCachingSection].every(
    bool => bool === false,
  );
  const shouldHideSection = database.is_attached_dwh || hasNoContent;

  const handleToggleModelActionsEnabled = useCallback(
    (nextValue: boolean) =>
      updateDatabase({
        id: database.id,
        settings: { "database-enable-actions": nextValue },
      }),
    [database.id, updateDatabase],
  );

  if (shouldHideSection) {
    return null;
  }

  return (
    <DatabaseInfoSection
      name={t`Model features`}
      description={t`Choose whether to enable features related to Metabase models. These will often require a write connection.`}
    >
      {hasModelActionsSection && (
        <ModelActionsSection
          hasModelActionsEnabled={database.hasActionsEnabled()}
          onToggleModelActionsEnabled={handleToggleModelActionsEnabled}
        />
      )}

      {hasModelCachingSection && <ModelCachingControl database={database} />}
    </DatabaseInfoSection>
  );
};
