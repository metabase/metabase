import type { ReactNode } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import {
  SettingsCard,
  SettingsRow,
} from "metabase/data-studio/common/components/SettingsSection";
import {
  type EavBinding,
  type PropertyRegistry,
  type PropertySignal,
  type RegistryProperty,
  type ResolvedEavBinding,
  useEavBinding,
  usePropertyRegistry,
} from "metabase/metadata/table-structure";
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

/**
 * `table` is Connected data's details table under a section title; `form` is
 * the Library's settings rows (label left, control right), without the title
 * or the property count the page around it already shows
 */
type StorageLayout = "table" | "form";

type CustomPropertiesSectionProps = {
  table: Table;
  disabled: boolean;
  layout?: StorageLayout;
  onChange: (binding: Partial<EavBinding>) => void;
};

export function CustomPropertiesSection({
  table,
  disabled,
  layout = "table",
  onChange,
}: CustomPropertiesSectionProps) {
  const resolved = useEavBinding(table);
  const state = usePropertyRegistry(table);
  const registry = state.status === "loaded" ? state.registry : undefined;
  const noun = getEntityNoun(resolved.entityTable);
  const isForm = layout === "form";

  const copy = getStorageCopy(
    layout,
    resolved.entityTable?.display_name,
    registry?.properties[0]?.name,
  );

  const rows = (
    <>
      <StorageRow
        layout={layout}
        label={copy.owner}
        description={copy.ownerHelp}
      >
        <EntityTableValue table={table} resolved={resolved} />
      </StorageRow>
      <ColumnsRows
        table={table}
        resolved={resolved}
        layout={layout}
        copy={copy}
        disabled={disabled}
        onChange={onChange}
      />
      <DefinitionsRows
        resolved={resolved}
        layout={layout}
        copy={copy}
        disabled={disabled}
        onChange={onChange}
      />
      {/* In the settings, the property list row already says this */}
      {!isForm && (
        <StorageRow
          layout={layout}
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
        >
          {resolved.definitionTable
            ? t`Property rows with a definitions table`
            : t`Property rows without a definitions table`}
        </StorageRow>
      )}
      {!isForm && (
        <StorageRow layout={layout} label={t`Properties`}>
          <PropertyRegistrySummary
            table={table}
            registry={registry}
            isUnbound={state.status === "unbound"}
          />
        </StorageRow>
      )}
      <StorageRow
        layout={layout}
        label={copy.checks}
        description={copy.checksHelp}
      >
        <DataQualityChecks
          failingCount={registry ? countFailingChecks(registry) : null}
        />
      </StorageRow>
    </>
  );

  if (isForm) {
    return <SettingsCard>{rows}</SettingsCard>;
  }
  return (
    <SidebarSection
      title={getCustomPropertiesTitle(resolved.entityTable)}
      description={t`Each row is one custom property value of a ${noun.singular}.`}
    >
      <DetailsTable>{rows}</DetailsTable>
    </SidebarSection>
  );
}

/** One storage setting, as a details-table row or a settings row with help */
function StorageRow({
  layout,
  label,
  description,
  isFilled = false,
  children,
}: {
  layout: StorageLayout;
  label: ReactNode;
  /** Help under a settings row's label; details tables don't show it */
  description?: ReactNode;
  /** A control that fills its details-table cell */
  isFilled?: boolean;
  children: ReactNode;
}) {
  return layout === "form" ? (
    <SettingsRow label={label} description={description}>
      {children}
    </SettingsRow>
  ) : (
    <DetailsRow label={label} fillValue={isFilled} value={children} />
  );
}

/** What each storage setting is called, and the help a settings row adds */
type StorageCopy = {
  owner: string;
  ownerHelp?: string;
  recordColumn: string;
  recordColumnHelp?: string;
  propertyColumn: string;
  propertyColumnHelp?: string;
  valueColumn: string;
  valueColumnHelp?: string;
  definitions: string;
  definitionsHelp?: string;
  noDefinitions: string;
  labelColumn: string;
  typeColumn: string;
  definitionColumnHelp?: string;
  checks: string;
  checksHelp?: string;
};

/**
 * Connected data's details table keeps the storage terms; the Library's
 * settings say what each column does, with this table's own examples
 */
function getStorageCopy(
  layout: StorageLayout,
  entityName: string | undefined,
  exampleProperty: string | undefined,
): StorageCopy {
  if (layout === "table") {
    return {
      owner: t`Belongs to`,
      recordColumn: t`Entity key`,
      propertyColumn: t`Property`,
      valueColumn: t`Value`,
      definitions: t`Definitions`,
      noDefinitions: t`No definitions table`,
      labelColumn: t`Label column`,
      typeColumn: t`Type column`,
      checks: t`Checks`,
    };
  }
  return {
    owner: t`Properties of`,
    ownerHelp: t`The records these properties describe`,
    recordColumn: t`Record column`,
    recordColumnHelp: entityName
      ? t`Which ${entityName} record each row belongs to`
      : t`Which record each row belongs to`,
    propertyColumn: t`Property name column`,
    propertyColumnHelp: exampleProperty
      ? t`Each row's property, like ${exampleProperty}`
      : t`Each row's property`,
    valueColumn: t`Value column`,
    valueColumnHelp: t`The property's value for that record`,
    definitions: t`Property list`,
    definitionsHelp: t`Optional. A table that gives each property's label and type. Without one, they're worked out from the values.`,
    noDefinitions: t`No property list`,
    labelColumn: t`Label column`,
    typeColumn: t`Type column`,
    definitionColumnHelp: t`In the property list`,
    checks: t`Data checks`,
    checksHelp: t`Type mismatches, duplicates and properties missing from the list`,
  };
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

function ColumnsRows({
  table,
  resolved,
  layout,
  copy,
  disabled,
  onChange,
}: {
  table: Table;
  resolved: ResolvedEavBinding;
  layout: StorageLayout;
  copy: StorageCopy;
  disabled: boolean;
  onChange: (binding: Partial<EavBinding>) => void;
}) {
  const { binding } = resolved;
  const fields = table.fields ?? [];
  return [
    <ColumnSelectRow
      key="entity-key"
      layout={layout}
      label={copy.recordColumn}
      description={copy.recordColumnHelp}
      fields={fields}
      value={binding.entityKeyFieldId}
      disabled={disabled}
      onChange={(entityKeyFieldId) => onChange({ entityKeyFieldId })}
    />,
    <ColumnSelectRow
      key="property"
      layout={layout}
      label={copy.propertyColumn}
      description={copy.propertyColumnHelp}
      fields={fields}
      value={binding.propertyFieldId}
      disabled={disabled}
      onChange={(propertyFieldId) => onChange({ propertyFieldId })}
    />,
    <ColumnSelectRow
      key="value"
      layout={layout}
      label={copy.valueColumn}
      description={copy.valueColumnHelp}
      fields={fields}
      value={binding.valueFieldId}
      disabled={disabled}
      onChange={(valueFieldId) => onChange({ valueFieldId })}
    />,
  ];
}

function DefinitionsRows({
  resolved,
  layout,
  copy,
  disabled,
  onChange,
}: {
  resolved: ResolvedEavBinding;
  layout: StorageLayout;
  copy: StorageCopy;
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
    <StorageRow
      key="definitions"
      layout={layout}
      label={copy.definitions}
      description={copy.definitionsHelp}
      isFilled
    >
      <Select
        aria-label={copy.definitions}
        classNames={getSelectClassNames(layout)}
        data={resolved.schemaTables.map((schemaTable) => ({
          value: String(schemaTable.id),
          label: schemaTable.display_name,
        }))}
        value={definitionTable ? String(definitionTable.id) : null}
        placeholder={copy.noDefinitions}
        searchable
        clearable
        disabled={disabled}
        onChange={(value) =>
          selectDefinitionTable(value != null ? Number(value) : null)
        }
      />
    </StorageRow>,
    definitionTable && (
      <ColumnSelectRow
        key="label"
        layout={layout}
        label={copy.labelColumn}
        description={copy.definitionColumnHelp}
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
        layout={layout}
        label={copy.typeColumn}
        description={copy.definitionColumnHelp}
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
  layout,
  label,
  description,
  fields,
  value,
  placeholder = t`Choose a column`,
  clearable,
  disabled,
  onChange,
}: {
  layout: StorageLayout;
  label: string;
  description?: string;
  fields: Field[];
  value: FieldId | null;
  placeholder?: string;
  clearable?: boolean;
  disabled: boolean;
  onChange: (fieldId: FieldId | null) => void;
}) {
  return (
    <StorageRow
      layout={layout}
      label={label}
      description={description}
      isFilled
    >
      <Select
        aria-label={label}
        classNames={getSelectClassNames(layout)}
        data={fields.map((field) => ({
          value: String(field.id),
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
    </StorageRow>
  );
}

/** A details-table cell's borderless select, or a settings row's normal one */
const getSelectClassNames = (layout: StorageLayout) =>
  layout === "table" ? DETAILS_CELL_INPUT_CLASS_NAMES : undefined;

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
