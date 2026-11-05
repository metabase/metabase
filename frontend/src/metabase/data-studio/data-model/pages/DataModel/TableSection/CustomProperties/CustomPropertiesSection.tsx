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
  type EavDefinitionTable,
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
  Code,
  Group,
  Loader,
  Popover,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Field, FieldId, Table } from "metabase-types/api";

import {
  getCustomPropertiesTitle,
  getEntityNoun,
  getMissingBindingMessage,
  needsAttention,
} from "../../PropertyDetailsPanel/property-labels";

import { RecognitionPreview } from "./RecognitionPreview";
import { SuggestTransformInput } from "./SuggestTransformInput";
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

  return (
    <SidebarSection title={getCustomPropertiesTitle(resolved.entityTable)}>
      <Text size="sm" c="text-secondary">
        {t`Each row is one custom property value of a ${noun.singular}.`}
      </Text>
      <RecognitionPreview table={table} resolved={resolved} />
      <DetailsTable>
        <DetailsRow
          label={t`Belongs to`}
          value={<EntityTableValue table={table} resolved={resolved} />}
        />
        <DetailsRow
          label={t`Columns`}
          value={
            <ColumnsInput
              table={table}
              resolved={resolved}
              disabled={disabled}
              onChange={onChange}
            />
          }
        />
        <DetailsRow
          label={t`Definitions`}
          value={
            <DefinitionsInput
              resolved={resolved}
              disabled={disabled}
              onChange={onChange}
            />
          }
        />
        <DetailsRow
          label={t`Shape`}
          value={<ShapeValue resolved={resolved} />}
        />
        <DetailsRow
          label={t`Properties`}
          value={
            <PropertyRegistrySummary
              table={table}
              resolved={resolved}
              registry={registry}
              isUnbound={state.status === "unbound"}
            />
          }
        />
        <DetailsRow label={t`Checks`} value={<ChecksValue table={table} />} />
        <DetailsRow
          label={t`Transform`}
          value={
            <SuggestTransformInput
              table={table}
              resolved={resolved}
              disabled={disabled}
            />
          }
        />
      </DetailsTable>
    </SidebarSection>
  );
}

function ChecksValue({ table }: { table: Table }) {
  const generated = useCustomPropertyChecks(table);
  if (generated == null) {
    return <Loader size="xs" />;
  }
  return (
    <GeneratedChecksSummary
      table={generated.tableRef}
      checks={generated.checks}
      results={generated.results}
    />
  );
}

function EntityTableValue({
  table,
  resolved,
}: {
  table: Table;
  resolved: ResolvedEavBinding;
}) {
  const { entityTable, entityKeyField } = resolved;
  if (!entityTable || !entityKeyField) {
    return <Text c="text-secondary">{getMissingBindingMessage()}</Text>;
  }
  return (
    <Stack gap="xs" py="xs">
      <Link
        to={Urls.dataStudioData({
          databaseId: table.db_id,
          schemaName: table.schema,
          tableId: entityTable.id,
        })}
      >
        <Text c="text-brand" fw="bold">
          {entityTable.display_name}
        </Text>
      </Link>
      <Text size="sm" c="text-secondary">
        {t`Inferred: ${entityKeyField.name} → ${entityTable.name}`}
      </Text>
    </Stack>
  );
}

const fieldName = (fields: Field[], fieldId: FieldId | null) =>
  fields.find((field) => getRawTableFieldId(field) === fieldId)?.name;

function ColumnsInput({
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
  const { getTableStructure } = useTableStructures();
  const { inference, eavOverrides } = getTableStructure(table);
  const { binding } = resolved;
  const fields = table.fields ?? [];
  const columnNames = [
    fieldName(fields, binding.entityKeyFieldId),
    fieldName(fields, binding.propertyFieldId),
    fieldName(fields, binding.valueFieldId),
  ];
  const isConfident =
    inference.confidence === "high" &&
    columnNames.every((name) => name != null) &&
    eavOverrides.entityKeyFieldId === undefined &&
    eavOverrides.propertyFieldId === undefined &&
    eavOverrides.valueFieldId === undefined;
  const [isEditingByAdmin, { open: startEditing }] = useDisclosure(false);
  const isEditing = isEditingByAdmin || !isConfident;

  if (!isEditing) {
    return (
      <CollapsedPointers
        names={columnNames}
        hint={t`Inferred: ${inference.signal}`}
        disabled={disabled}
        onEdit={startEditing}
      />
    );
  }

  return (
    <Stack gap="sm" py="xs">
      <ColumnSelect
        label={t`Entity key`}
        fields={fields}
        value={binding.entityKeyFieldId}
        disabled={disabled}
        onChange={(entityKeyFieldId) => onChange({ entityKeyFieldId })}
      />
      <ColumnSelect
        label={t`Property`}
        fields={fields}
        value={binding.propertyFieldId}
        disabled={disabled}
        onChange={(propertyFieldId) => onChange({ propertyFieldId })}
      />
      <ColumnSelect
        label={t`Value`}
        fields={fields}
        value={binding.valueFieldId}
        disabled={disabled}
        onChange={(valueFieldId) => onChange({ valueFieldId })}
      />
    </Stack>
  );
}

function DefinitionsInput({
  resolved,
  disabled,
  onChange,
}: {
  resolved: ResolvedEavBinding;
  disabled: boolean;
  onChange: (binding: Partial<EavBinding>) => void;
}) {
  const {
    binding,
    definitionTable,
    definitionInference,
    isDefinitionOverridden,
    isLabelOverridden,
    isTypeOverridden,
  } = resolved;
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
  const isEditing = isEditingByAdmin || !isConfident;

  if (!isEditing) {
    return (
      <CollapsedPointers
        names={names}
        hint={t`Inferred: ${definitionInference.signal}. Labels from ${names[1] ?? ""}, types from ${names[2] ?? ""}.`}
        disabled={disabled}
        onEdit={startEditing}
      />
    );
  }

  const selectDefinitionTable = (
    definitionTableId: EavBinding["definitionTableId"] | undefined,
  ) =>
    onChange({
      definitionTableId,
      labelFieldId: undefined,
      typeFieldId: undefined,
    });

  return (
    <Stack gap="sm" py="xs">
      <Select
        label={t`Definitions table`}
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
      <Text size="sm" c="text-secondary">
        <DefinitionTableHint resolved={resolved} />
      </Text>
      {!disabled && isDefinitionOverridden && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={() => selectDefinitionTable(undefined)}
        >
          {t`Use the inferred definitions table`}
        </Button>
      )}
      {definitionTable && (
        <DefinitionColumnSelect
          label={t`Label column`}
          definitionTable={definitionTable}
          value={binding.labelFieldId}
          disabled={disabled}
          onChange={(labelFieldId) => onChange({ labelFieldId })}
        />
      )}
      {definitionTable && (
        <DefinitionColumnSelect
          label={t`Type column`}
          definitionTable={definitionTable}
          value={binding.typeFieldId}
          disabled={disabled}
          onChange={(typeFieldId) => onChange({ typeFieldId })}
        />
      )}
    </Stack>
  );
}

function DefinitionTableHint({ resolved }: { resolved: ResolvedEavBinding }) {
  const { definitionTable, definitionInference, isDefinitionOverridden } =
    resolved;
  if (definitionTable) {
    return isDefinitionOverridden
      ? t`Set by an admin`
      : t`Inferred: ${definitionInference.signal}`;
  }
  return t`None. Labels come from the property names and types from the values.`;
}

function CollapsedPointers({
  names,
  hint,
  disabled,
  onEdit,
}: {
  names: (string | undefined)[];
  hint: string;
  disabled: boolean;
  onEdit: () => void;
}) {
  return (
    <Stack gap="xs" py="xs">
      <Group gap="sm" justify="space-between" wrap="nowrap">
        <Code>{names.filter(Boolean).join(" · ")}</Code>
        {!disabled && (
          <Button size="compact-sm" variant="subtle" px={0} onClick={onEdit}>
            {t`Edit`}
          </Button>
        )}
      </Group>
      <Text size="sm" c="text-secondary">
        {hint}
      </Text>
    </Stack>
  );
}

function ColumnSelect({
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
    <Select
      label={label}
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
  );
}

function DefinitionColumnSelect({
  label,
  definitionTable,
  value,
  disabled,
  onChange,
}: {
  label: string;
  definitionTable: EavDefinitionTable;
  value: FieldId | null;
  disabled: boolean;
  onChange: (fieldId: FieldId | null | undefined) => void;
}) {
  return (
    <ColumnSelect
      label={label}
      fields={definitionTable.fields ?? []}
      value={value}
      placeholder={t`None`}
      clearable
      disabled={disabled}
      onChange={onChange}
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
    <Stack gap="xs" py="xs">
      <Text c="text-primary">
        {resolved.definitionTable
          ? t`Property rows with a definitions table`
          : t`Property rows without a definitions table`}
      </Text>
      <Popover opened={isOpen} onChange={close} position="bottom-start">
        <Popover.Target>
          <Button
            size="compact-sm"
            variant="subtle"
            w="fit-content"
            px={0}
            onClick={toggle}
          >
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
    </Stack>
  );
}

function PropertyRegistrySummary({
  table,
  resolved,
  registry,
  isUnbound,
}: {
  table: Table;
  resolved: ResolvedEavBinding;
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
  const attentionCount = properties.filter(needsAttention).length;
  const noun = getEntityNoun(resolved.entityTable);

  return (
    <Stack gap="xs" py="xs">
      <Group gap="sm">
        <Text c="text-primary" fw="bold">
          {ngettext(
            msgid`${properties.length} property`,
            `${properties.length} properties`,
            properties.length,
          )}
        </Text>
        {attentionCount > 0 && (
          <Badge color="warning" variant="light">
            {t`${attentionCount} need attention`}
          </Badge>
        )}
      </Group>
      <Text size="sm" c="text-secondary">
        {t`Coverage is out of all ${registry.entityCount.toLocaleString()} ${noun.plural}`}
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
        variant="subtle"
        w="fit-content"
        px={0}
      >
        {t`Review properties`}
      </Button>
    </Stack>
  );
}
