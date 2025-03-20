import { useCallback } from "react";
import { t } from "ttag";

import { Flex } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseData, DatabaseId } from "metabase-types/api";

import { DatabaseInfoSection } from "../DatabaseInfoSection";

import { ModelActionsSection } from "./ModelActionsSection";
import { ModelCachingControl } from "./ModelCachingControl";

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

  const contentVisibility = {
    showModelActions: isEditingDatabase && database.supportsActions(),
    showModelCachingSection:
      isModelPersistenceEnabled && database.supportsPersistence(),
  };
  const hasNoContent = Object.values(contentVisibility).every(x => x === false);

  const handleToggleModelActionsEnabled = useCallback(
    (nextValue: boolean) =>
      updateDatabase({
        id: database.id,
        settings: { "database-enable-actions": nextValue },
      }),
    [database.id, updateDatabase],
  );

  if (database.is_attached_dwh || hasNoContent) {
    return null;
  }

  return (
    <DatabaseInfoSection
      name={t`Model features`}
      description={t`Choose whether to enable features related to Metabase models. These will often require a write connection.`}
      data-testid="database-model-features-section"
    >
      <Flex direction="column" gap="md">
        {contentVisibility.showModelActions && (
          <ModelActionsSection
            hasModelActionsEnabled={database.hasActionsEnabled()}
            onToggleModelActionsEnabled={handleToggleModelActionsEnabled}
          />
        )}

        {contentVisibility.showModelCachingSection && (
          <ModelCachingControl database={database} />
        )}
      </Flex>
    </DatabaseInfoSection>
  );
};
