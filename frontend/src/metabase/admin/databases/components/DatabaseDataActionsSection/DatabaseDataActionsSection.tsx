import { useCallback } from "react";
import { t } from "ttag";

import {
  hasActionsEnabled,
  hasDbRoutingEnabled,
} from "metabase/common/utils/database";
import { hasFeature } from "metabase/databases";
import type { Database, DatabaseData, DatabaseId } from "metabase-types/api";

import { DatabaseInfoSection } from "../DatabaseInfoSection";

import { DataActionsSection } from "./DataActionsSection";

export const DatabaseDataActionsSection = ({
  database,
  updateDatabase,
}: {
  database: Database;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseData>,
  ) => Promise<void>;
}) => {
  const isVisible =
    !database.is_attached_dwh &&
    database.id != null &&
    hasFeature(database, "actions");

  const handleToggle = useCallback(
    (nextValue: boolean) =>
      updateDatabase({
        id: database.id,
        settings: { "database-enable-actions": nextValue },
      }),
    [database.id, updateDatabase],
  );

  if (!isVisible) {
    return null;
  }

  return (
    <DatabaseInfoSection
      name={t`Data actions`}
      description={t`Let saved queries write to this database. This will often require a write connection.`}
      data-testid="database-data-actions-section"
    >
      <DataActionsSection
        hasDataActionsEnabled={hasActionsEnabled(database)}
        onToggleDataActionsEnabled={handleToggle}
        disabled={hasDbRoutingEnabled(database)}
      />
    </DatabaseInfoSection>
  );
};
