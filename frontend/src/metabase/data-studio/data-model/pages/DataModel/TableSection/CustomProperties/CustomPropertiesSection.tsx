import { useDisclosure } from "@mantine/hooks";
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
  type ResolvedEavBinding,
  useEavBinding,
  usePropertyRegistry,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { GeneratedChecksSummary } from "metabase/metadata/table-structure/generated-checks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Badge,
  Button,
  Group,
  Loader,
  Popover,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Field, FieldId, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";
import {
  getCustomPropertiesTitle,
  getEntityNoun,
  getMissingBindingMessage,
  needsAttention,
} from "../../PropertyDetailsPanel/property-labels";
import { InferredIcon, NeedsReviewBadge } from "../InferenceReview";

import { RecognitionPreview } from "./RecognitionPreview";
import { useCustomPropertyChecks } from "./use-custom-property-checks";

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
  const columns = useColumnsReview(table, resolved);
  const definitions = useDefinitionsReview(resolved);
  const attentionCount = registry?.properties.filter(needsAttention).length;

  return (
    <SidebarSection title={getCustomPropertiesTitle(resolved.entityTable)}>
      <Text size="sm" c="text-secondary">
        {t`Each row is one custom property value of a ${noun.singular}.`}
      </Text>
      <RecognitionPreview table={table} resolved={resolved} />
      <DetailsTable>
        <DetailsRow
          label={t`Belongs to`}
          labelAside={
            <InferredIcon description={getEntityInference(resolved)} />
          }
          value={<EntityTableValue table={table} resolved={resolved} />}
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
            labelAside={<InferredIcon description={columns.inference} />}
            value={
              <PointersValue
                names={columns.names}
                disabled={disabled}
                onChange={columns.startEditing}
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
            labelAside={<InferredIcon description={definitions.inference} />}
            value={
              <PointersValue
                names={definitions.names}
                disabled={disabled}
                onChange={definitions.startEditing}
              />
            }
          />
        )}
        <DetailsRow
          label={t`Shape`}
          value={<ShapeValue resolved={resolved} />}
        />
        <DetailsRow
          label={t`Properties`}
          labelAside={attentionCount ? <NeedsReviewBadge /> : null}
          value={
            <PropertyRegistrySummary
              table={table}
              registry={registry}
              isUnbound={state.status === "unbound"}
            />
          }
        />
        <ChecksRow table={table} />
      </DetailsTable>
    </SidebarSection>
  );
}

function ChecksRow({ table }: { table: Table }) {
  const generated = useCustomPropertyChecks(table);
  return (
    <DetailsRow
      label={t`Checks`}
      value={
        generated == null ? (
          <Loader size="xs" />
        ) : (
          <GeneratedChecksSummary
            table={generated.tableRef}
            checks={generated.checks}
            results={generated.results}
          />
        )
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

function useColumnsReview(table: Table, resolved: ResolvedEavBinding) {
  const { getTableStructure } = useTableStructures();
  const { inference, eavOverrides } = getTableStructure(table);
  const { binding } = resolved;
  const fields = table.fields ?? [];
  const names = [
    fieldName(fields, binding.entityKeyFieldId),
    fieldName(fields, binding.propertyFieldId),
    fieldName(fields, binding.valueFieldId),
  ];
  const isConfident =
    inference.confidence === "high" &&
    names.every((name) => name != null) &&
    eavOverrides.entityKeyFieldId === undefined &&
    eavOverrides.propertyFieldId === undefined &&
    eavOverrides.valueFieldId === undefined;
  const [isEditingByAdmin, { open: startEditing }] = useDisclosure(false);
  return {
    names,
    inference: t`Inferred: ${inference.signal}`,
    isEditing: isEditingByAdmin || !isConfident,
    startEditing,
  };
}

function useDefinitionsReview({
  binding,
  definitionTable,
  definitionInference,
  isDefinitionOverridden,
  isLabelOverridden,
  isTypeOverridden,
}: ResolvedEavBinding) {
  const definitionFields = definitionTable?.fields ?? [];
  const names = [
    definitionTable?.name,
    fieldName(definitionFields, binding.labelFieldId),
    fieldName(definitionFields, binding.typeFieldId),
  ];
  const isConfident =
    definitionTable != null &&
    !isDefinitionOverridden &&
    !isLabelOverridden &&
    !isTypeOverridden &&
    names.every((name) => name != null);
  const [isEditingByAdmin, { open: startEditing }] = useDisclosure(false);
  return {
    names,
    inference: t`Inferred: ${definitionInference.signal}. Labels from ${names[1] ?? ""}, types from ${names[2] ?? ""}.`,
    isEditing: isEditingByAdmin || !isConfident,
    startEditing,
  };
}

function PointersValue({
  names,
  disabled,
  onChange,
}: {
  names: (string | undefined)[];
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <Group gap="sm" justify="space-between" wrap="nowrap">
      <Text truncate>{names.filter(Boolean).join(" · ")}</Text>
      {!disabled && (
        <Button size="compact-sm" flex="0 0 auto" onClick={onChange}>
          {t`Change`}
        </Button>
      )}
    </Group>
  );
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
  const { binding, definitionTable, isDefinitionOverridden } = resolved;
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
      labelAside={
        <InferredIcon
          description={
            isDefinitionOverridden ? null : getDefinitionTableHint(resolved)
          }
        />
      }
      labelNote={
        !disabled &&
        isDefinitionOverridden && (
          <Button
            size="compact-sm"
            onClick={() => selectDefinitionTable(undefined)}
          >
            {t`Use the inferred table`}
          </Button>
        )
      }
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

function getDefinitionTableHint({
  definitionTable,
  definitionInference,
}: ResolvedEavBinding) {
  return definitionTable
    ? t`Inferred: ${definitionInference.signal}`
    : t`None. Labels come from the property names and types from the values.`;
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

function ShapeValue({ resolved }: { resolved: ResolvedEavBinding }) {
  const [isOpen, { toggle, close }] = useDisclosure(false);
  return (
    <Group gap="sm" justify="space-between" wrap="nowrap">
      <Text>
        {resolved.definitionTable
          ? t`Property rows with a definitions table`
          : t`Property rows without a definitions table`}
      </Text>
      <Popover opened={isOpen} onChange={close} position="bottom-end">
        <Popover.Target>
          <Button size="compact-sm" flex="0 0 auto" onClick={toggle}>
            {t`Shapes we recognise`}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="sm" p="md" maw={360}>
            {getRecognisedShapes().map(({ label, isWorking }) => (
              <Group key={label} gap="sm" wrap="nowrap" justify="space-between">
                <Text size="sm">{label}</Text>
                <Badge
                  variant="light"
                  color={isWorking ? "positive" : "neutral"}
                  flex="0 0 auto"
                >
                  {isWorking ? t`Working` : t`Next step`}
                </Badge>
              </Group>
            ))}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
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
