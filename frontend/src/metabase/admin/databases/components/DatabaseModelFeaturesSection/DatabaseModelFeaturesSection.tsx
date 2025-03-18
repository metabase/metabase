import { useCallback } from "react";
import { t } from "ttag";

import { Alert, Flex, Icon, Text } from "metabase/ui";
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

  const isDbRoutingEnabled = database.hasDatabaseRoutingEnabled();

  return (
    <DatabaseInfoSection
      name={t`Model features`}
      description={t`Choose whether to enable features related to Metabase models. These will often require a write connection.`}
      data-testid="database-model-features-section"
    >
      <Flex direction="column" gap="md">
        {isDbRoutingEnabled && (
          <Alert icon={<Icon name="info" size={16} />} color={"brand"}>
            <Text fw="bold">{t`Model features can not be enabled if database routing is enabled.`}</Text>
          </Alert>
        )}

        {contentVisibility.showModelActions && (
          <ModelActionsSection
            hasModelActionsEnabled={database.hasActionsEnabled()}
            onToggleModelActionsEnabled={handleToggleModelActionsEnabled}
            disabled={isDbRoutingEnabled}
          />
        )}

        {contentVisibility.showModelCachingSection && (
          <ModelCachingControl
            database={database}
            disabled={isDbRoutingEnabled}
          />
        )}
      </Flex>
    </DatabaseInfoSection>
  );
};
