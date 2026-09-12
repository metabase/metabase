import { skipToken } from "@reduxjs/toolkit/query/react";
import { t } from "ttag";

import { Label } from "metabase/admin/databases/components/DatabaseFeatureComponents";
import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import {
  useListSyncableDatabaseSchemasQuery,
  useUpdateDatabaseMutation,
} from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks/use-toast";
import { isDbModifiable } from "metabase/common/utils/database";
import { hasFeature } from "metabase/databases";
import type { WorkspacesSectionProps } from "metabase/plugins";
import { useSetting } from "metabase/settings";
import { Box, Flex, Select, Text } from "metabase/ui";

import { WORKSPACES_SCHEMA_SETTING } from "../../constants";

export function WorkspacesSection({ database }: WorkspacesSectionProps) {
  const [sendToast] = useToast();
  const [updateDatabase] = useUpdateDatabaseMutation();
  const areWorkspacesEnabled = useSetting("workspaces-enabled");

  const isSectionVisible =
    areWorkspacesEnabled &&
    isDbModifiable(database) &&
    hasFeature(database, "schemas");

  const {
    data: schemas = [],
    isLoading,
    error: schemasError,
  } = useListSyncableDatabaseSchemasQuery(
    isSectionVisible ? database.id : skipToken,
  );

  if (!isSectionVisible) {
    return null;
  }

  const schema = database.settings?.[WORKSPACES_SCHEMA_SETTING] ?? null;
  const options =
    schema == null || schemas.includes(schema) ? schemas : [...schemas, schema];

  const handleSchemaChange = async (newSchema: string | null) => {
    const { error } = await updateDatabase({
      id: database.id,
      settings: { [WORKSPACES_SCHEMA_SETTING]: newSchema },
    });

    if (error) {
      sendToast({ message: t`An error occurred`, icon: "warning" });
    }
  };

  return (
    <DatabaseInfoSection
      name={t`Workspaces`}
      description={t`While workspaces are enabled, transforms write their output tables into a workspace schema instead of their configured target schema, transparently to everything that reads them.`}
      data-testid="workspaces-section"
    >
      <Flex justify="space-between" align="center" gap="sm">
        <Box>
          <Label htmlFor="workspace-schema-select">{t`Workspace schema`}</Label>
          <Text c="text-secondary" mt="xxs" style={{ textWrap: "pretty" }}>
            {t`Transforms write their output tables here. Pick a schema that already exists and that your connection can write to.`}
          </Text>
        </Box>
        <Box w="15rem" style={{ flexShrink: 0 }}>
          <DelayedLoadingAndErrorWrapper
            loading={isLoading}
            error={schemasError}
          >
            <Select
              id="workspace-schema-select"
              data={options}
              value={schema}
              data-testid="workspace-schema-select"
              placeholder={t`Select a schema`}
              clearable
              searchable
              nothingFoundMessage={t`No schemas found`}
              onChange={handleSchemaChange}
            />
          </DelayedLoadingAndErrorWrapper>
        </Box>
      </Flex>
    </DatabaseInfoSection>
  );
}
