import { t } from "ttag";

import {
  useListDatabaseIdFieldsQuery,
  useUpdateFieldMutation,
} from "metabase/api";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { useMetadataToasts } from "metabase/common/hooks";
import { CurrencyPicker, FkTargetPicker } from "metabase/metadata/components";
import {
  FACET_KEYS,
  type Facets,
  type ResolvedFieldType,
  getAdditivity,
  getAdditivityLabel,
  getFacetKey,
  getFacetOptions,
  getFieldTypeLabel,
  isFieldTypeA,
  useTableSemantics,
} from "metabase/metadata/semantic-types";
import {
  getFieldCurrency,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { MultiSelect, Text } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../DetailPanel";
import { SemanticTypeSelect } from "../SemanticInputs";
import {
  InferredIcon,
  NeedsReviewBadge,
} from "../TableSection/InferenceReview";

interface FieldSemanticsSectionProps {
  field: Field;
  table: Table;
}

export function FieldSemanticsSection({
  field,
  table,
}: FieldSemanticsSectionProps) {
  const readOnly = !table.can_write;
  const { fieldTypes, setFieldType } = useTableSemantics(table);
  const resolved = fieldTypes.get(getRawTableFieldId(field));

  if (resolved == null) {
    return null;
  }

  const { semanticType, facets } = resolved;
  const additivity = getAdditivity(semanticType);
  const isForeignKey =
    semanticType != null && isFieldTypeA(semanticType, "type/FK");
  const isMoney =
    semanticType != null && isFieldTypeA(semanticType, "type/Currency");

  return (
    <SidebarSection title={t`Metadata`}>
      <DetailsTable>
        <DetailsRow
          label={t`Semantic type`}
          fillValue
          labelAside={
            resolved.needsReview ? (
              <NeedsReviewBadge />
            ) : (
              <InferredIcon description={getInferenceDescription(resolved)} />
            )
          }
          value={
            <SemanticTypeSelect
              field={field}
              value={semanticType}
              markedValue={getMarkedType(field, resolved)}
              classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
              disabled={readOnly}
              onChange={(value) =>
                setFieldType(field, {
                  semanticType: value,
                  facets: withoutFacet(facets, value),
                })
              }
            />
          }
        />
        <DetailsRow
          label={t`Also`}
          fillValue
          value={
            <FacetsSelect
              field={field}
              resolved={resolved}
              disabled={readOnly}
              onChange={(value) =>
                setFieldType(field, { semanticType, facets: value })
              }
            />
          }
        />
        {isForeignKey && (
          <DetailsRow
            label={t`Foreign key target`}
            fillValue
            value={<FieldTargetInput field={field} table={table} />}
          />
        )}
        {isMoney && (
          <DetailsRow
            label={t`Currency`}
            fillValue
            value={<FieldCurrencyInput field={field} disabled={readOnly} />}
          />
        )}
        {additivity != null && (
          <DetailsRow
            label={t`Aggregation`}
            value={<Text>{getAdditivityLabel(additivity)}</Text>}
          />
        )}
      </DetailsTable>
    </SidebarSection>
  );
}

function getInferenceDescription({
  inference,
  isOverridden,
  replacedType,
}: ResolvedFieldType): string | null {
  if (isOverridden || inference == null) {
    return null;
  }
  return replacedType != null
    ? t`Inferred: ${inference.signal}. Sync had ${getFieldTypeLabel(replacedType)}.`
    : t`Inferred: ${inference.signal}`;
}

function getMarkedType(
  field: Field,
  { semanticType, inference }: ResolvedFieldType,
): string | null {
  const inferredType = inference?.semanticType ?? field.semantic_type ?? null;
  return semanticType !== inferredType ? inferredType : null;
}

function withoutFacet(facets: Facets, type: string | null): Facets {
  return Object.fromEntries(
    Object.entries(facets).filter(([, facetType]) => facetType !== type),
  );
}

function FacetsSelect({
  field,
  resolved,
  disabled,
  onChange,
}: {
  field: Field;
  resolved: ResolvedFieldType;
  disabled: boolean;
  onChange: (facets: Facets) => void;
}) {
  const { semanticType, facets } = resolved;
  const options = getFacetOptions(field).map((group) => ({
    ...group,
    items: group.items.filter((item) => item.value !== semanticType),
  }));
  const value = FACET_KEYS.flatMap((facetKey) => {
    const type = facets[facetKey];
    return type ? [type] : [];
  });

  const handleChange = (types: string[]) => {
    const nextFacets = types.reduce<Facets>((result, type) => {
      const facetKey = getFacetKey(type);
      return facetKey ? { ...result, [facetKey]: type } : result;
    }, {});
    onChange(nextFacets);
  };

  return (
    <MultiSelect
      aria-label={t`Also`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={options}
      value={value}
      placeholder={value.length === 0 ? t`Nothing else` : undefined}
      searchable
      disabled={disabled}
      onChange={handleChange}
      data-testid="field-facets-select"
    />
  );
}

function FieldTargetInput({ field, table }: { field: Field; table: Table }) {
  const { data: idFields = [], isLoading } = useListDatabaseIdFieldsQuery({
    id: table.db_id,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const [updateField] = useUpdateFieldMutation();
  const { sendErrorToast } = useMetadataToasts();

  return (
    <FkTargetPicker
      aria-label={t`Foreign key target`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      field={field}
      idFields={idFields}
      isLoading={isLoading}
      value={field.fk_target_field_id}
      disabled={!table.can_write}
      onChange={async (fieldId) => {
        const { error } = await updateField({
          id: getRawTableFieldId(field),
          fk_target_field_id: fieldId,
        });
        if (error) {
          sendErrorToast(
            t`Failed to update the target of ${field.display_name}`,
          );
        }
      }}
    />
  );
}

function FieldCurrencyInput({
  field,
  disabled,
}: {
  field: Field;
  disabled: boolean;
}) {
  const [updateField] = useUpdateFieldMutation();
  const { sendErrorToast } = useMetadataToasts();

  return (
    <CurrencyPicker
      aria-label={t`Currency`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      value={getFieldCurrency(field.settings)}
      disabled={disabled}
      onChange={async (currency) => {
        const { error } = await updateField({
          id: getRawTableFieldId(field),
          settings: { ...field.settings, currency },
        });
        if (error) {
          sendErrorToast(
            t`Failed to update the currency of ${field.display_name}`,
          );
        }
      }}
    />
  );
}
