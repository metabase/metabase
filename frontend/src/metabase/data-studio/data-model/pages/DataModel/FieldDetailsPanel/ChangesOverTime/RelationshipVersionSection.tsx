import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  type VersionChoice,
  findColumnByName,
  findFieldById,
  getEventDateFields,
  useChangingAttributes,
  useSchemaTables,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Stack, Text } from "metabase/ui";
import { isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import { VersionSelect } from "./AttributeHistorySection";
import { EndUserPreview, type PreviewNames } from "./EndUserPreview";
import { ColumnSelect, PastValuesRows } from "./PastValuesRows";
import { singularName } from "./names";
import { useEndUserExample } from "./use-end-user-example";

type RelationshipVersionSectionProps = {
  field: Field;
  table: Table;
  disabled: boolean;
};

function useDimensionTable(field: Field, table: Table) {
  const { tables } = useSchemaTables(table);
  const dimensionTable = tables.find((other) =>
    (other.fields ?? []).some(
      (otherField) =>
        getRawTableFieldId(otherField) === field.fk_target_field_id,
    ),
  );
  return { tables, dimensionTable };
}

export function useCanPickRelationshipVersion(field: Field, table: Table) {
  const { variant } = useChangingAttributes();
  const { dimensionTable } = useDimensionTable(field, table);
  return variant === "relationship" && isFK(field) && dimensionTable != null;
}

/**
 * PROTOTYPE: mocked. On a fact table's foreign key: which version of the
 * dimension each row joins to, as of the row's date or today, per attribute.
 */
export function RelationshipVersionSection({
  field,
  table,
  disabled,
}: RelationshipVersionSectionProps) {
  const { tables, dimensionTable } = useDimensionTable(field, table);
  const { getRelationship, setRelationship } = useChangingAttributes();
  const relationship = getRelationship(field, table, dimensionTable, tables);
  const historyTable = tables.find(
    (other) => other.id === relationship.historyTableId,
  );
  const isKept =
    relationship.source === "history-table" && historyTable != null;
  const eventDateField = findFieldById(table, relationship.asOfFieldId);
  const attributes = (dimensionTable?.fields ?? []).filter(
    (attribute) => !isPK(attribute) && !isFK(attribute),
  );
  const changingAttributes = attributes.filter(
    (attribute) => findColumnByName(historyTable, attribute) != null,
  );
  const previewAttribute = changingAttributes[0];
  const versionOf = (attribute: Field): VersionChoice =>
    relationship.attributeVersions[String(getRawTableFieldId(attribute))] ??
    relationship.version;
  const names: PreviewNames = {
    facts: table.display_name,
    fact: singularName(table.display_name),
    dimension: field.display_name,
    attribute: previewAttribute?.display_name ?? "",
    eventDate: eventDateField?.display_name ?? t`Date`,
  };
  const example = useEndUserExample({
    binding: relationship,
    historyTable,
    valueField:
      previewAttribute && findColumnByName(historyTable, previewAttribute),
    dimensionTable,
    factTable: table,
    fkField: field,
    eventDateField,
  });

  if (dimensionTable == null) {
    return null;
  }

  return (
    <SidebarSection
      title={t`Which ${field.display_name.toLowerCase()}`}
      description={t`${dimensionTable.display_name} change over time. Pick which version of the ${field.display_name.toLowerCase()} each ${names.fact.toLowerCase()} shows.`}
    >
      <Stack gap="lg">
        <DetailsTable>
          <PastValuesRows
            dimensionTable={dimensionTable}
            tables={tables}
            binding={relationship}
            notKeptLabel={t`Not kept: only current values`}
            disabled={disabled}
            onChange={(update) => setRelationship(field, update)}
          />
          {isKept && (
            <>
              <DetailsRow
                label={t`${table.display_name} use`}
                fillValue
                value={
                  <VersionSelect
                    names={{ ...names, attribute: field.display_name }}
                    value={relationship.version}
                    disabled={disabled}
                    onChange={(version) =>
                      setRelationship(field, { version, attributeVersions: {} })
                    }
                  />
                }
              />
              <DetailsRow
                label={t`Dated by`}
                fillValue
                value={
                  <ColumnSelect
                    label={t`Dated by`}
                    fields={getEventDateFields(table)}
                    value={relationship.asOfFieldId}
                    disabled={disabled}
                    onChange={(asOfFieldId) =>
                      setRelationship(field, { asOfFieldId })
                    }
                  />
                }
              />
            </>
          )}
        </DetailsTable>
        {isKept && (
          <Stack gap="sm">
            <Text fw="bold" size="sm">
              {t`Per attribute`}
            </Text>
            <DetailsTable>
              {attributes.map((attribute) =>
                changingAttributes.includes(attribute) ? (
                  <DetailsRow
                    key={getRawTableFieldId(attribute)}
                    label={attribute.display_name}
                    fillValue
                    value={
                      <VersionSelect
                        names={{ ...names, attribute: attribute.display_name }}
                        value={versionOf(attribute)}
                        disabled={disabled}
                        onChange={(version) =>
                          setRelationship(field, {
                            attributeVersions: {
                              ...relationship.attributeVersions,
                              [String(getRawTableFieldId(attribute))]: version,
                            },
                          })
                        }
                      />
                    }
                  />
                ) : (
                  <DetailsRow
                    key={getRawTableFieldId(attribute)}
                    label={attribute.display_name}
                    value={
                      <Text c="text-secondary">{t`Current value only`}</Text>
                    }
                  />
                ),
              )}
            </DetailsTable>
          </Stack>
        )}
        {isKept && previewAttribute && (
          <EndUserPreview
            names={names}
            version={versionOf(previewAttribute)}
            example={example}
          />
        )}
      </Stack>
    </SidebarSection>
  );
}
