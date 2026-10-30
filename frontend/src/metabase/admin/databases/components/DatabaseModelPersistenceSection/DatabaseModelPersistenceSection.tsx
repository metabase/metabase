import { t } from "ttag";

import { hasDbRoutingEnabled } from "metabase/common/utils/database";
import { hasFeature } from "metabase/databases";
import type { Database } from "metabase-types/api";

import { DatabaseInfoSection } from "../DatabaseInfoSection";

import { ModelCachingControl } from "./ModelCachingControl";

export const DatabaseModelPersistenceSection = ({
  database,
  isModelPersistenceEnabled,
}: {
  database: Database;
  isModelPersistenceEnabled: boolean;
}) => {
  const isVisible =
    !database.is_attached_dwh &&
    isModelPersistenceEnabled &&
    hasFeature(database, "persist-models");

  if (!isVisible) {
    return null;
  }

  return (
    <DatabaseInfoSection
      name={t`Model persistence`}
      description={t`Store the results of models in this database so questions built on them run faster. This will often require a write connection.`}
      data-testid="database-model-persistence-section"
    >
      <ModelCachingControl
        database={database}
        disabled={hasDbRoutingEnabled(database)}
      />
    </DatabaseInfoSection>
  );
};
