import { useState } from "react";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { PLUGIN_DATA_EDITING } from "metabase/plugins";
import { Box, Flex } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseData, DatabaseId } from "metabase-types/api";

import { DatabaseInfoSection } from "./DatabaseInfoSection";
import {
  Description,
  Error,
  Label,
} from "./DatabaseModelFeaturesSection/ModelFeatureToggles.styled";

export function DatabaseTableEditingSection({
  database,
  updateDatabase,
}: {
  database: Database;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseData>,
  ) => Promise<void>;
}) {
  const isEditingDatabase = !!database.id;
  const showTableEditingSection =
    isEditingDatabase &&
    database.supportsActions() &&
    PLUGIN_DATA_EDITING.isEnabled();

  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (enabled: boolean) => {
    try {
      setError(null);

      await updateDatabase({
        id: database.id,
        settings: { "database-enable-table-editing": enabled },
      });
    } catch (err) {
      setError(getResponseErrorMessage(err) || t`An error occurred`);
    }
  };

  if (!showTableEditingSection) {
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
          value={PLUGIN_DATA_EDITING.hasDatabaseTableEditingEnabled(database)}
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
