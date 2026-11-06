import { msgid, ngettext, t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import {
  type EavBinding,
  type PropertyRegistry,
  type PropertySignal,
  type RegistryProperty,
  type ResolvedEavBinding,
  useEavBinding,
  usePropertyRegistry,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Button,
  Group,
  Icon,
  Loader,
  Select,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Field, FieldId, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";
import {
  getCustomPropertiesTitle,
  getEntityNoun,
  getMissingBindingMessage,
} from "../../PropertyDetailsPanel/property-labels";
import { DataQualityChecks } from "../DataQualityChecks";
import { InferredIcon, InferredValue } from "../InferenceReview";

type CustomPropertiesSectionProps = {
  table: Table;
  disabled: boolean;
  onChange: (binding: Partial<EavBinding>) => void;
};

export function CustomPropertiesSection({
  table,
  disabled,
  onChange,
}: CustomPropertiesSectionProps) {
  const resolved = useEavBinding(table);
  const state = usePropertyRegistry(table);
  const registry = state.status === "loaded" ? state.registry : undefined;
  const noun = getEntityNoun(resolved.entityTable);
  const columns = useColumnsReview(table, resolved, onChange);
  const definitions = useDefinitionsReview(resolved, onChange);

  return (
    <SidebarSection title={getCustomPropertiesTitle(resolved.entityTable)}>
      <Text size="sm" c="text-secondary">
        {t`Each row is one custom property value of a ${noun.singular}.`}
      </Text>
      <DetailsTable>
        <DetailsRow
          label={t`Belongs to`}
          value={
            <Group gap="xs" wrap="nowrap">
              <EntityTableValue table={table} resolved={resolved} />
              <InferredIcon description={getEntityInference(resolved)} />
            </Group>
          }
        />
        {columns.isEditing ? (
          <ColumnsRows
            table={table}
            resolved={resolved}
            disabled={disabled}
            onChange={onChange}
          />
        ) : (
          <DetailsRow
            label={t`Columns`}
            value={
              <InferredValue
                value={columns.names.join(" · ")}
                inference={columns.inference}
                readOnly={disabled}
                isInset={false}
                onConfirm={columns.confirm}
                onChange={columns.confirm}
                data-testid="eav-columns-review"
              />
            }
          />
        )}
        {definitions.isEditing ? (
          <DefinitionsRows
            resolved={resolved}
            disabled={disabled}
            onChange={onChange}
          />
        ) : (
          <DetailsRow
            label={t`Definitions`}
            value={
              <InferredValue
                value={definitions.names.filter(Boolean).join(" · ")}
                inference={definitions.inference}
                readOnly={disabled}
                isInset={false}
                onConfirm={definitions.confirm}
                onChange={definitions.confirm}
                data-testid="eav-definitions-review"
              />
            }
          />
        )}
        <DetailsRow
          label={
            <>
              {t`Shape`}
              <Tooltip label={<RecognisedShapes />} maw={320} multiline>
                <Icon
                  name="info"
                  size={14}
                  ml="xs"
                  c="text-secondary"
                  aria-label={t`Shapes we recognize`}
                  // Sits on the text's baseline inside the label paragraph
                  style={{ verticalAlign: "-2px" }}
                />
              </Tooltip>
            </>
          }
          value={
            resolved.definitionTable
              ? t`Property rows with a definitions table`
              : t`Property rows without a definitions table`
          }
        />
        <DetailsRow
          label={t`Properties`}
          value={
            <PropertyRegistrySummary
              table={table}
              registry={registry}
              isUnbound={state.status === "unbound"}
            />
          }
        />
        <ChecksRow registry={registry} />
      </DetailsTable>
    </SidebarSection>
  );
}

const hasSignal = (
  properties: RegistryProperty[],
  type: PropertySignal["type"],
) =>
  properties.some(({ signals }) =>
    signals.some((signal) => signal.type === type),
  );

function countFailingChecks({ properties }: PropertyRegistry) {
  const driftCount = properties.filter(({ signals }) =>
    signals.some(({ type }) => type === "type-drift"),
  ).length;
  const tableWideFailures = [
    hasSignal(properties, "undefined"),
    hasSignal(properties, "duplicate"),
  ].filter(Boolean).length;
  return driftCount + tableWideFailures;
}

function ChecksRow({ registry }: { registry: PropertyRegistry | undefined }) {
  return (
    <DetailsRow
      label={t`Checks`}
      value={
        <DataQualityChecks
          failingCount={registry ? countFailingChecks(registry) : null}
        />
      }
    />
  );
}

function getEntityInference({
  entityTable,
  entityKeyField,
}: ResolvedEavBinding) {
  return entityTable && entityKeyField
    ? t`Inferred: ${entityKeyField.name} → ${entityTable.name}`
    : null;
}

function EntityTableValue({
  table,
  resolved,
}: {
  table: Table;
  resolved: ResolvedEavBinding;
}) {
  const { entityTable } = resolved;
  if (!entityTable) {
    return <Text c="text-secondary">{getMissingBindingMessage()}</Text>;
  }
  return (
    <Link
      to={Urls.dataStudioData({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: entityTable.id,
      })}
    >
      <Text c="text-brand">{entityTable.display_name}</Text>
    </Link>
  );
}

const fieldName = (fields: Field[], fieldId: FieldId | null) =>
  fields.find((field) => getRawTableFieldId(field) === fieldId)?.name;

/**
 * The entity key, property, and value columns: sync's guess to confirm or
 * change, then pickers once an admin has. Confirming records the guess, so
 * Change and Confirm both open the pickers.
 */
function useColumnsReview(
  table: Table,
  resolved: ResolvedEavBinding,
  onChange: (binding: Partial<EavBinding>) => void,
) {
  const { getTableStructure } = useTableStructures();
  const { inference, eavOverrides } = getTableStructure(table);
  const { binding } = resolved;
  const fields = table.fields ?? [];
  const names = [
    fieldName(fields, binding.entityKeyFieldId),
    fieldName(fields, binding.propertyFieldId),
    fieldName(fields, binding.valueFieldId),
  ];
  // A guess missing any column isn't one to confirm
  const isInferred =
    names.every((name) => name != null) &&
    eavOverrides.entityKeyFieldId === undefined &&
    eavOverrides.propertyFieldId === undefined &&
    eavOverrides.valueFieldId === undefined;
  return {
    names,
    inference: t`Inferred: ${inference.signal}`,
    isEditing: !isInferred,
    confirm: () =>
      onChange({
        entityKeyFieldId: binding.entityKeyFieldId,
        propertyFieldId: binding.propertyFieldId,
        valueFieldId: binding.valueFieldId,
      }),
  };
}

/** The definitions table and its label and type columns, like the columns */
function useDefinitionsReview(
  {
    binding,
    definitionTable,
    definitionInference,
    isDefinitionOverridden,
    isLabelOverridden,
    isTypeOverridden,
  }: ResolvedEavBinding,
  onChange: (binding: Partial<EavBinding>) => void,
) {
  const definitionFields = definitionTable?.fields ?? [];
  const names = [
    definitionTable?.name,
    fieldName(definitionFields, binding.labelFieldId),
    fieldName(definitionFields, binding.typeFieldId),
  ];
  // No definitions table isn't a guess to confirm
  const isInferred =
    definitionTable != null &&
    !isDefinitionOverridden &&
    !isLabelOverridden &&
    !isTypeOverridden;
  return {
    names,
    inference: t`Inferred: ${definitionInference.signal}. Labels from ${names[1] ?? ""}, types from ${names[2] ?? ""}.`,
    isEditing: !isInferred,
    confirm: () =>
      onChange({
        definitionTableId: definitionTable?.id ?? null,
        labelFieldId: binding.labelFieldId,
        typeFieldId: binding.typeFieldId,
      }),
  };
}

function ColumnsRows({
  table,
  resolved,
  disabled,
  onChange,
}: {
  table: Table;
  resolved: ResolvedEavBinding;
  disabled: boolean;
  onChange: (binding: Partial<EavBinding>) => void;
}) {
  const { binding } = resolved;
  const fields = table.fields ?? [];
  return [
    <ColumnSelectRow
      key="entity-key"
      label={t`Entity key`}
      fields={fields}
      value={binding.entityKeyFieldId}
      disabled={disabled}
      onChange={(entityKeyFieldId) => onChange({ entityKeyFieldId })}
    />,
    <ColumnSelectRow
      key="property"
      label={t`Property`}
      fields={fields}
      value={binding.propertyFieldId}
      disabled={disabled}
      onChange={(propertyFieldId) => onChange({ propertyFieldId })}
    />,
    <ColumnSelectRow
      key="value"
      label={t`Value`}
      fields={fields}
      value={binding.valueFieldId}
      disabled={disabled}
      onChange={(valueFieldId) => onChange({ valueFieldId })}
    />,
  ];
}

function DefinitionsRows({
  resolved,
  disabled,
  onChange,
}: {
  resolved: ResolvedEavBinding;
  disabled: boolean;
  onChange: (binding: Partial<EavBinding>) => void;
}) {
  const { binding, definitionTable } = resolved;
  const selectDefinitionTable = (
    definitionTableId: EavBinding["definitionTableId"] | undefined,
  ) =>
    onChange({
      definitionTableId,
      labelFieldId: undefined,
      typeFieldId: undefined,
    });

  return [
    <DetailsRow
      key="definitions"
      label={t`Definitions`}
      fillValue
      value={
        <Select
          aria-label={t`Definitions table`}
          classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
          data={resolved.schemaTables.map((schemaTable) => ({
            value: String(schemaTable.id),
            label: schemaTable.display_name,
          }))}
          value={definitionTable ? String(definitionTable.id) : null}
          placeholder={t`No definitions table`}
          searchable
          clearable
          disabled={disabled}
          onChange={(value) =>
            selectDefinitionTable(value != null ? Number(value) : null)
          }
        />
      }
    />,
    definitionTable && (
      <ColumnSelectRow
        key="label"
        label={t`Label column`}
        fields={definitionTable.fields ?? []}
        value={binding.labelFieldId}
        placeholder={t`None`}
        clearable
        disabled={disabled}
        onChange={(labelFieldId) => onChange({ labelFieldId })}
      />
    ),
    definitionTable && (
      <ColumnSelectRow
        key="type"
        label={t`Type column`}
        fields={definitionTable.fields ?? []}
        value={binding.typeFieldId}
        placeholder={t`None`}
        clearable
        disabled={disabled}
        onChange={(typeFieldId) => onChange({ typeFieldId })}
      />
    ),
  ];
}

function ColumnSelectRow({
  label,
  fields,
  value,
  placeholder = t`Choose a column`,
  clearable,
  disabled,
  onChange,
}: {
  label: string;
  fields: Field[];
  value: FieldId | null;
  placeholder?: string;
  clearable?: boolean;
  disabled: boolean;
  onChange: (fieldId: FieldId | null) => void;
}) {
  return (
    <DetailsRow
      label={label}
      fillValue
      value={
        <Select
          aria-label={label}
          classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
          data={fields.map((field) => ({
            value: String(getRawTableFieldId(field)),
            label: field.display_name,
          }))}
          value={value != null ? String(value) : null}
          placeholder={placeholder}
          searchable
          clearable={clearable}
          allowDeselect={clearable}
          disabled={disabled}
          onChange={(value) => onChange(value != null ? Number(value) : null)}
        />
      }
    />
  );
}

type RecognisedShape = {
  label: string;
  isWorking: boolean;
};

const getRecognisedShapes = (): RecognisedShape[] => [
  { label: t`Property rows with a definitions table`, isWorking: true },
  { label: t`Property rows without a definitions table`, isWorking: true },
  { label: t`Wildcard property_* and custom_* columns`, isWorking: true },
  {
    label: t`One value column per type, like Jira's stringvalue, numbervalue and datevalue`,
    isWorking: false,
  },
  { label: t`JSON property bags`, isWorking: false },
];

/** The custom property shapes sync recognizes now, then the ones planned */
function RecognisedShapes() {
  const shapes = getRecognisedShapes();
  const groups = [
    {
      title: t`Working`,
      shapes: shapes.filter(({ isWorking }) => isWorking),
    },
    {
      title: t`Next step`,
      shapes: shapes.filter(({ isWorking }) => !isWorking),
    },
  ];
  // Plain elements so the text keeps the tooltip's colors
  return (
    <Stack gap="sm">
      <strong>{t`Shapes we recognize`}</strong>
      {groups.map(({ title, shapes }) => (
        <div key={title}>
          <div>{title}</div>
          {shapes.map(({ label }) => (
            <div key={label}>{`• ${label}`}</div>
          ))}
        </div>
      ))}
    </Stack>
  );
}

function PropertyRegistrySummary({
  table,
  registry,
  isUnbound,
}: {
  table: Table;
  registry: PropertyRegistry | undefined;
  isUnbound: boolean;
}) {
  if (isUnbound) {
    return <Text c="text-secondary">{getMissingBindingMessage()}</Text>;
  }
  if (!registry) {
    return <Loader size="xs" />;
  }
  const { properties } = registry;

  return (
    <Group gap="sm" justify="space-between" wrap="nowrap">
      <Text>
        {ngettext(
          msgid`${properties.length} property`,
          `${properties.length} properties`,
          properties.length,
        )}
      </Text>
      <Button
        component={Link}
        to={Urls.dataStudioData({
          databaseId: table.db_id,
          schemaName: table.schema,
          tableId: table.id,
          tab: "properties",
        })}
        size="compact-sm"
        flex="0 0 auto"
      >
        {t`Review`}
      </Button>
    </Group>
  );
}
