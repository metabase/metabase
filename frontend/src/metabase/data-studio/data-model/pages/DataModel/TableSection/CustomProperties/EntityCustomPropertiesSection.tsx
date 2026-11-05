import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import {
  findTargetTable,
  isRoleA,
  usePropertyRegistry,
  usePropertySampleRows,
  useSchemaTables,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Button, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import { formatPropertyValue, pivotSampleRows } from "./pivot-preview";

const SHOWN_PROPERTY_COUNT = 8;

export function EntityCustomPropertiesSection({ table }: { table: Table }) {
  const { tables: schemaTables } = useSchemaTables(table);
  const { getTableStructure } = useTableStructures();
  const valueTable = schemaTables.find((candidate) => {
    const { role, eav } = getTableStructure(candidate);
    if (!role || !isRoleA(role, "role/CustomPropertyTable")) {
      return false;
    }
    const entityKeyField = candidate.fields?.find(
      (field) => getRawTableFieldId(field) === eav.entityKeyFieldId,
    );
    return findTargetTable(entityKeyField, schemaTables)?.id === table.id;
  });
  return valueTable ? (
    <EntityCustomProperties table={table} valueTable={valueTable} />
  ) : null;
}

function EntityCustomProperties({
  table,
  valueTable,
}: {
  table: Table;
  valueTable: Table;
}) {
  const sample = useSampleEntityProperties(table, valueTable);

  return (
    <SidebarSection
      title={t`Custom properties`}
      titleAside={
        <Button
          component={Link}
          to={Urls.dataStudioData({
            databaseId: valueTable.db_id,
            schemaName: valueTable.schema,
            tableId: valueTable.id,
            tab: "properties",
          })}
          size="compact-sm"
        >
          {t`Review properties`}
        </Button>
      }
    >
      <Text size="sm" c="text-secondary">
        {sample
          ? t`${sample.propertyCount} properties from ${valueTable.display_name}. Values shown for ${sample.entityName}.`
          : t`From ${valueTable.display_name}.`}
      </Text>
      {sample && (
        <DetailsTable>
          {sample.rows.map(({ key, label, value }) => (
            <DetailsRow key={key} label={label} value={value} />
          ))}
        </DetailsTable>
      )}
    </SidebarSection>
  );
}

function useSampleEntityProperties(table: Table, valueTable: Table) {
  const { data } = useGetAdhocQueryQuery(
    typeof table.id === "number"
      ? {
          database: table.db_id,
          type: "query",
          query: { "source-table": table.id, limit: 1 },
        }
      : skipToken,
  );
  const row = data?.data.rows[0];
  const columnNames = data?.data.cols.map(({ name }) => name) ?? [];
  const fields = table.fields ?? [];
  const readColumn = (field: Field | undefined) =>
    field ? (row?.[columnNames.indexOf(field.name)] ?? null) : null;
  const entityKey = readColumn(fields.find(isPK));
  const samples = usePropertySampleRows(
    valueTable,
    typeof entityKey === "number" || typeof entityKey === "string"
      ? entityKey
      : undefined,
  );
  const state = usePropertyRegistry(valueTable);

  if (!row || !samples || state.status !== "loaded") {
    return null;
  }

  const shownProperties = state.registry.properties.filter(
    (property) => !property.isHidden && property.mergedInto == null,
  );
  const [entity] = pivotSampleRows(samples, shownProperties);
  const rows = shownProperties
    .filter((property) => entity?.valuesByProperty.has(property.key))
    .slice(0, SHOWN_PROPERTY_COUNT)
    .map((property) => ({
      key: property.key,
      label: property.displayName,
      value:
        formatPropertyValue(
          property,
          entity?.valuesByProperty.get(property.key),
        ) ?? t`Doesn't fit ${property.type}`,
    }));
  const name = readColumn(fields.find(({ name }) => name === "name"));

  return {
    entityName: String(name ?? entityKey),
    propertyCount: shownProperties.length,
    rows,
  };
}
