import { useState } from "react";
import { t } from "ttag";

import {
  Description,
  Error,
  Label,
} from "metabase/admin/databases/components/DatabaseFeatureComponents";
import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import { hasFeature } from "metabase/admin/databases/utils";
import Toggle from "metabase/common/components/Toggle";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { Box, Flex } from "metabase/ui";
import type { Database, DatabaseData, DatabaseId } from "metabase-types/api";

import {
  DATABASE_TABLE_EDITING_SETTING,
  ENGINE_SUPPORTED_FOR_TABLE_EDITING,
  isDatabaseTableEditingEnabled,
} from "../settings";

export function AdminDatabaseTableEditingSection({
  database,
  updateDatabase,
}: {
  database: Database;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseData>,
  ) => Promise<void>;
}) {
  const isEngineSupported = ENGINE_SUPPORTED_FOR_TABLE_EDITING.has(
    database.engine ?? "",
  );

  const showTableEditingSection =
    !!database.id &&
    isEngineSupported &&
    hasFeature(database, "actions/data-editing");

  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (enabled: boolean) => {
    try {
      setError(null);

      await updateDatabase({
        id: database.id,
        settings: { [DATABASE_TABLE_EDITING_SETTING]: enabled },
      });
    } catch (err) {
      setError(getResponseErrorMessage(err) || t`An error occurred`);
    }
  };

  if (!showTableEditingSection || !isEngineSupported) {
    return null;
  }

  return (
    <DatabaseInfoSection
      name={t`Editable table data`}
      description={t`Allow the data within tables of this database to be edited by Admin users.`}
      data-testid="database-table-editing-section"
    >
      <Flex align="center" justify="space-between" mb="xs">
        <Label htmlFor="table-editing-toggle">{t`Editable tables`}</Label>
        <Toggle
          id="table-editing-toggle"
          value={isDatabaseTableEditingEnabled(database)}
          onChange={handleToggle}
        />
      </Flex>
      <Box maw="22.5rem">
        {error ? <Error>{error}</Error> : null}
        <Description>
          {t`Your database connection will need Write permissions.`}
        </Description>
      </Box>
    </DatabaseInfoSection>
  );
}
