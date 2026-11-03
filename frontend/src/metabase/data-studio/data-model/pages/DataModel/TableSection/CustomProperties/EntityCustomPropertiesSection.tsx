import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import { dayjs } from "metabase/dayjs";
import {
  findTargetTable,
  isRoleA,
  usePropertyRegistry,
  usePropertySampleRows,
  useSchemaTables,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Button, Paper, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isDate, isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, RowValue, Table } from "metabase-types/api";

import { getEntityNoun } from "../../PropertyDetailsPanel/property-labels";

import { formatPropertyValue, pivotSampleRows } from "./pivot-preview";

const CARD_PROPERTY_COUNT = 8;

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
  const state = usePropertyRegistry(valueTable);
  const noun = getEntityNoun(table);
  const count =
    state.status === "loaded"
      ? state.registry.properties.filter(
          (property) => !property.isHidden && property.mergedInto == null,
        ).length
      : null;

  return (
    <SidebarSection title={t`Custom properties`}>
      <Text size="sm" c="text-secondary">
        {count != null
          ? t`${count} properties from ${valueTable.display_name}. They show on each ${noun.singular}'s card below the typed fields, and as a Custom properties group of columns in the query builder.`
          : t`From ${valueTable.display_name}.`}
      </Text>
      <ObjectCardPreview table={table} valueTable={valueTable} />
      <Button
        component={Link}
        to={Urls.dataStudioData({
          databaseId: valueTable.db_id,
          schemaName: valueTable.schema,
          tableId: valueTable.id,
          tab: "properties",
        })}
        size="compact-sm"
        variant="subtle"
        w="fit-content"
        px={0}
      >
        {t`Review properties`}
      </Button>
    </SidebarSection>
  );
}

const formatTypedValue = (field: Field, value: RowValue) => {
  if (value == null) {
    return "—";
  }
  return isDate(field)
    ? dayjs(String(value)).format("MMM D, YYYY")
    : String(value);
};

function ObjectCardPreview({
  table,
  valueTable,
}: {
  table: Table;
  valueTable: Table;
}) {
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
  const readColumn = (field: Field) =>
    row?.[columnNames.indexOf(field.name)] ?? null;
  const fields = table.fields ?? [];
  const keyField = fields.find(isPK);
  const entityKey = keyField ? readColumn(keyField) : null;
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

  const nameField = fields.find(({ name }) => name === "name");
  const typedFields = fields.filter(
    (field) =>
      field !== keyField &&
      field !== nameField &&
      columnNames.includes(field.name),
  );
  const [entity] = pivotSampleRows(samples, state.registry.properties);
  const shownProperties = state.registry.properties
    .filter(
      (property) =>
        !property.isHidden &&
        property.mergedInto == null &&
        entity?.valuesByProperty.has(property.key),
    )
    .slice(0, CARD_PROPERTY_COUNT);

  return (
    <Paper withBorder radius="md" p="lg">
      <Stack gap="md">
        <Stack gap={0}>
          <Text size="sm" c="text-secondary">
            {t`Object card preview`}
          </Text>
          <Title order={4}>
            {nameField ? String(readColumn(nameField)) : String(entityKey)}
          </Title>
        </Stack>
        <DetailsTable>
          {typedFields.map((field) => (
            <DetailsRow
              key={field.name}
              label={field.display_name}
              value={formatTypedValue(field, readColumn(field))}
            />
          ))}
        </DetailsTable>
        <Text size="sm" fw="bold" c="text-secondary">
          {t`Custom properties`}
        </Text>
        <DetailsTable>
          {shownProperties.map((property) => (
            <DetailsRow
              key={property.key}
              label={property.displayName}
              value={
                formatPropertyValue(
                  property,
                  entity?.valuesByProperty.get(property.key),
                ) ?? t`Doesn't fit ${property.type}`
              }
            />
          ))}
        </DetailsTable>
      </Stack>
    </Paper>
  );
}
