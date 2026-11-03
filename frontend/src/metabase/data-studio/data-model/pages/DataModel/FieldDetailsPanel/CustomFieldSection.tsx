import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { getSemanticTypeName } from "metabase/common/utils/fields";
import {
  type BoundDefinitions,
  type CustomPropertyFacet,
  type PropertyDefinition,
  inferCustomPropertyFacet,
  inferDefinitionColumns,
  inferWildcardDefinitionTable,
  readDeclaredType,
  useDefinitionRows,
  useSchemaTables,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Code, Loader, Stack, Text } from "metabase/ui";
import { isDate, isSummable } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

type DefinitionSource = {
  tableName: string;
  labelColumn: string | null;
  typeColumn: string | null;
  bound: BoundDefinitions | null;
};

function getDefinitionSource(
  table: Table,
  schemaTables: Table[],
): DefinitionSource | null {
  const definitionTable = inferWildcardDefinitionTable(table, schemaTables);
  if (!definitionTable) {
    return null;
  }
  const fields = definitionTable.fields ?? [];
  const columns = inferDefinitionColumns(fields);
  const nameOf = (fieldId: number | null) =>
    fields.find((field) => getRawTableFieldId(field) === fieldId)?.name ?? null;
  return {
    tableName: definitionTable.name,
    labelColumn: nameOf(columns.labelFieldId),
    typeColumn: nameOf(columns.typeFieldId),
    bound:
      columns.keyFieldId != null
        ? {
            tableId: definitionTable.id,
            keyFieldId: columns.keyFieldId,
            nameFieldId: null,
            labelFieldId: columns.labelFieldId,
            typeFieldId: columns.typeFieldId,
          }
        : null,
  };
}

export function CustomFieldSection({
  field,
  table,
}: {
  field: Field;
  table: Table;
}) {
  const facet = inferCustomPropertyFacet(field);
  const { tables: schemaTables } = useSchemaTables(table);
  const source = facet ? getDefinitionSource(table, schemaTables) : null;
  const { definitions } = useDefinitionRows(table.db_id, source?.bound ?? null);

  if (!facet) {
    return null;
  }

  const isLoading = source?.bound != null && definitions == null;
  const definition = definitions?.find(({ key }) => key === facet.suffix);

  return (
    <SidebarSection title={t`Custom field`}>
      <DetailsTable>
        <DetailsRow
          label={t`Structure`}
          value={
            <Stack gap="xs" py="xs">
              <Text c="text-primary">{t`Custom field`}</Text>
              <Text size="sm" c="text-secondary">
                {t`Inferred: named with the ${facet.prefix} prefix, so the customer chose this column`}
              </Text>
            </Stack>
          }
        />
        <DetailsRow
          label={t`Label source`}
          value={
            isLoading ? (
              <Loader size="xs" />
            ) : (
              <LabelSource
                field={field}
                facet={facet}
                source={source}
                definition={definition}
              />
            )
          }
        />
        <DetailsRow
          label={t`Meaning`}
          value={
            <Meaning
              field={field}
              facet={facet}
              source={source}
              definition={definition}
            />
          }
        />
      </DetailsTable>
    </SidebarSection>
  );
}

function LabelSource({
  field,
  facet,
  source,
  definition,
}: {
  field: Field;
  facet: CustomPropertyFacet;
  source: DefinitionSource | null;
  definition: PropertyDefinition | undefined;
}) {
  if (!source) {
    return (
      <Text c="text-primary" py="xs">
        {t`No definitions table, so the display name is the column name made readable`}
      </Text>
    );
  }
  const labelColumn = `${source.tableName}.${source.labelColumn ?? ""}`;
  if (!definition?.label) {
    return (
      <Text c="text-primary" py="xs">
        {t`${source.tableName} has no row named ${facet.suffix}, so the display name is the column name made readable`}
      </Text>
    );
  }
  const isEdited = field.display_name !== definition.label;
  return (
    <Stack gap="xs" py="xs">
      <Code w="fit-content">{labelColumn}</Code>
      <Text size="sm" c="text-secondary">
        {isEdited
          ? t`Edited by an admin, so sync leaves it. The label is “${definition.label}”.`
          : t`Sync sets the display name from it unless an admin edits it.`}
      </Text>
    </Stack>
  );
}

function Meaning({
  field,
  facet,
  source,
  definition,
}: {
  field: Field;
  facet: CustomPropertyFacet;
  source: DefinitionSource | null;
  definition: PropertyDefinition | undefined;
}) {
  const semanticTypeName = getSemanticTypeName(field.semantic_type);
  const declaredType = definition?.declaredType ?? null;
  const declared = readDeclaredType(declaredType, []);
  const consequence = getMeaningConsequence(field);
  return (
    <Stack gap="xs" py="xs">
      <Text c="text-primary" fw="bold">
        {semanticTypeName ?? t`No semantic type`}
      </Text>
      <Text size="sm" c="text-secondary">
        {t`Inferred from the rest of the name, ${facet.suffix}.`}
        {declaredType != null && source?.typeColumn != null && (
          <>
            {" "}
            {declared
              ? t`${source.tableName}.${source.typeColumn} says ${declaredType}.`
              : t`${source.tableName}.${source.typeColumn} says ${declaredType}, which has no type mapping yet.`}
          </>
        )}
        {consequence && <> {consequence}</>}
      </Text>
    </Stack>
  );
}

function getMeaningConsequence(field: Field) {
  if (isSummable(field)) {
    return t`Being a custom field doesn't change that, so it still counts as a measure.`;
  }
  if (isDate(field)) {
    return t`Being a custom field doesn't change that, so it can still be a table's main date.`;
  }
  return null;
}
