import { useState } from "react";
import { t } from "ttag";

import {
  Description,
  Error,
  Label,
} from "metabase/admin/databases/components/DatabaseFeatureComponents";
import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import Toggle from "metabase/common/components/Toggle";
import { trackSimpleEvent } from "metabase/lib/analytics";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { Box, Flex } from "metabase/ui";
import type {
  Database,
  DatabaseData,
  DatabaseId,
  DatabaseLocalSettingAvailability,
} from "metabase-types/api";

import {
  DATABASE_TABLE_EDITING_SETTING,
  isDatabaseTableEditingEnabled,
} from "../settings";

enum DisabledReasonKey {
  MissingDriverFeature = "driver-feature-missing",
  NoWriteableTable = "permissions/no-writable-table",
  SyncInProgress = "database-metadata/sync-in-progress",
  DatabaseEmtpy = "database-metadata/not-populated",
}

const VISIBLE_REASONS: string[] = [
  DisabledReasonKey.NoWriteableTable,
  DisabledReasonKey.SyncInProgress,
  DisabledReasonKey.DatabaseEmtpy,
];

export function AdminDatabaseTableEditingSection({
  database,
  settingsAvailable,
  updateDatabase,
}: {
  database: Database;
  settingsAvailable?: Record<string, DatabaseLocalSettingAvailability>;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseData>,
  ) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (enabled: boolean) => {
    try {
      setError(null);

      trackSimpleEvent({
        event: "edit_data_settings_toggled",
        event_detail: enabled ? "on" : "off",
        target_id: database.id,
        triggered_from: "admin-settings-databases",
      });

      await updateDatabase({
        id: database.id,
        settings: { [DATABASE_TABLE_EDITING_SETTING]: enabled },
      });
    } catch (err) {
      setError(getResponseErrorMessage(err) || t`An error occurred`);
    }
  };

  const dataEditingSetting =
    settingsAvailable?.[DATABASE_TABLE_EDITING_SETTING];

  const isSettingDisabled =
    !dataEditingSetting || dataEditingSetting.enabled === false;

  const firstDisabledReason =
    dataEditingSetting?.enabled === false
      ? dataEditingSetting?.reasons?.[0]
      : undefined;

  const shouldShowSection =
    !firstDisabledReason || VISIBLE_REASONS.includes(firstDisabledReason.key);

  if (!dataEditingSetting || !shouldShowSection) {
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
          disabled={isSettingDisabled}
        />
      </Flex>
      <Box maw="22.5rem">
        {error ? <Error>{error}</Error> : null}
        <Description>
          {firstDisabledReason?.message ??
            t`Your database connection will need Write permissions.`}
        </Description>
      </Box>
    </DatabaseInfoSection>
  );
}
