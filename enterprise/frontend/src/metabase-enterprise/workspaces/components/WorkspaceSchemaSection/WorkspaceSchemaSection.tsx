import { t } from "ttag";

import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import {
  useListSyncableDatabaseSchemasQuery,
  useUpdateDatabaseMutation,
} from "metabase/api";
import { isDbModifiable } from "metabase/common/utils/database";
import type { WorkspaceSchemaSectionProps } from "metabase/plugins";
import { Select } from "metabase/ui";

import { WORKSPACES_SCHEMA_SETTING } from "../../constants";

export function WorkspaceSchemaSection({
  database,
}: WorkspaceSchemaSectionProps) {
  const [updateDatabase] = useUpdateDatabaseMutation();
  const { data: schemas = [], isLoading } = useListSyncableDatabaseSchemasQuery(
    database.id,
  );

  if (!isDbModifiable(database)) {
    return null;
  }

  const schema = database.settings?.[WORKSPACES_SCHEMA_SETTING] ?? null;

  const handleChange = (nextSchema: string | null) => {
    updateDatabase({
      id: database.id,
      settings: { [WORKSPACES_SCHEMA_SETTING]: nextSchema },
    });
  };

  return (
    <DatabaseInfoSection
      name={t`Workspace schema`}
      description={t`The schema transform runs write their output tables to while workspaces are enabled. It has to exist already.`}
      data-testid="workspace-schema-section"
    >
      <Select
        data={schemas}
        value={schema}
        disabled={isLoading}
        clearable
        searchable
        placeholder={t`Select a schema`}
        nothingFoundMessage={t`No schemas`}
        maw="22.5rem"
        onChange={handleChange}
      />
    </DatabaseInfoSection>
  );
}
