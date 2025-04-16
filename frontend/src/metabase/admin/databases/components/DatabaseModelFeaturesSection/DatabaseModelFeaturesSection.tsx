import { useCallback } from "react";
import { t } from "ttag";

import { Flex } from "metabase/ui";
import type { Database, DatabaseData, DatabaseId } from "metabase-types/api";

import {
  hasActionsEnabled,
  hasDbRoutingEnabled,
  hasFeature,
} from "../../utils";
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
    showModelActions: isEditingDatabase && hasFeature(database, "actions"),
    showModelCachingSection:
      isModelPersistenceEnabled && hasFeature(database, "persist-models"),
  };
  const hasNoContent = Object.values(contentVisibility).every(
    (x) => x === false,
  );

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
            hasModelActionsEnabled={hasActionsEnabled(database)}
            onToggleModelActionsEnabled={handleToggleModelActionsEnabled}
            disabled={hasDbRoutingEnabled(database)}
          />
        )}

        {contentVisibility.showModelCachingSection && (
          <ModelCachingControl
            database={database}
            disabled={hasDbRoutingEnabled(database)}
          />
        )}
      </Flex>
    </DatabaseInfoSection>
  );
};
