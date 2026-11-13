import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from "metabase/data-studio/common/components/SettingsSection";
import { TablePropertyList } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TablePropertyList";
import { TableStructure } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableStructure";
import { isRoleA, useTableStructures } from "metabase/metadata/table-structure";
import { Button, Icon, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

/**
 * Connected data's structure settings, editable here too, and the custom
 * properties a custom-property table stores
 */
export function TableStructureSections({ table }: { table: Table }) {
  const { role } = useTableStructures().getTableStructure(table);
  const isCustomPropertyTable =
    role != null && isRoleA(role, "role/CustomPropertyTable");
  const isHistoryTable = role != null && isRoleA(role, "role/HistoryDimension");
  const getConnectedDataUrl = (tab: "properties") =>
    Urls.dataStudioData({
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      tab,
    });

  return (
    <>
      <SettingsSection
        title={t`Structure`}
        description={
          isHistoryTable
            ? t`Its role, what one row is, and the dates each version is true for. These change how queries on this table work.`
            : t`Its role, what one row is, and its main date. These change how queries on this table work.`
        }
      >
        <TableStructure
          table={table}
          readOnly={!table.can_write}
          layout="form"
        />
      </SettingsSection>
      {isCustomPropertyTable && (
        <SettingsSection
          title={t`Custom properties`}
          description={t`The properties this table stores for each record, one row per value.`}
        >
          <SettingsCard>
            <SettingsRow>
              <Stack gap="lg" w="100%">
                <TablePropertyList table={table} />
                <EditInConnectedDataButton
                  to={getConnectedDataUrl("properties")}
                />
              </Stack>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      )}
    </>
  );
}

function EditInConnectedDataButton({ to }: { to: string }) {
  return (
    <Button
      component={ForwardRefLink}
      to={to}
      w="fit-content"
      rightSection={<Icon name="arrow_right" />}
    >
      {t`Edit in Connected data`}
    </Button>
  );
}
