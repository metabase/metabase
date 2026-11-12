import { t } from "ttag";

import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import { ForwardRefLink } from "metabase/common/components/Link";
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
  const getConnectedDataUrl = (tab: "properties") =>
    Urls.dataStudioData({
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      tab,
    });

  return (
    <>
      <DatabaseInfoSection
        name={t`Structure`}
        description={t`Its role, what one row is, its main date, and who can see it. These change how queries on this table work.`}
        hasCard={false}
      >
        <Stack gap="xxl">
          <TableStructure
            table={table}
            readOnly={!table.can_write}
            hasTitle={false}
            getFieldUrl={(fieldId) =>
              Urls.dataStudioTableFields(table.id, fieldId)
            }
          />
        </Stack>
      </DatabaseInfoSection>
      {isCustomPropertyTable && (
        <DatabaseInfoSection
          name={t`Custom properties`}
          description={t`The properties this table stores for each record, one row per value.`}
          contentPx="xxxl"
          cardRadius="lg"
        >
          <Stack gap="xxl">
            <TablePropertyList table={table} />
            <EditInConnectedDataButton to={getConnectedDataUrl("properties")} />
          </Stack>
        </DatabaseInfoSection>
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
