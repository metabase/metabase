import type { Ref } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  type PropertyRegistry,
  type RegistryProperty,
  type ResolvedEavBinding,
  useEavBinding,
  usePropertyOverrides,
  usePropertyRegistry,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Alert,
  Button,
  Code,
  Group,
  Icon,
  Progress,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

import {
  DetailPanel,
  DetailPanelHeader,
  DetailsEditableText,
  FieldDetailsSkeleton,
} from "../DetailPanel";

import {
  type OpenPropertySignal,
  formatShare,
  getEntityNoun,
  getOpenSignals,
  getPropertyIcon,
  getPropertySemanticTypeOptions,
  getPropertyTypeLabel,
  getPropertyTypeOptions,
} from "./property-labels";

const MAX_SHOWN_VALUES = 8;

type PropertyDetailsPanelProps = {
  ref?: Ref<HTMLDivElement>;
  table: Table;
  propertyName: string;
  defaultWidth: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
};

export function PropertyDetailsPanel({
  ref,
  table,
  propertyName,
  defaultWidth,
  onWidthChange,
  onClose,
}: PropertyDetailsPanelProps) {
  const state = usePropertyRegistry(table);
  const resolved = useEavBinding(table);
  const property =
    state.status === "loaded"
      ? state.registry.properties.find(({ key }) => key === propertyName)
      : undefined;

  return (
    <DetailPanel
      ref={ref}
      defaultWidth={defaultWidth}
      onWidthChange={onWidthChange}
      data-testid="property-details-panel"
    >
      <DetailPanelHeader
        icon={property ? getPropertyIcon(property) : "string"}
        label={t`Custom property of ${resolved.entityTable?.display_name ?? table.display_name}`}
        title={property?.displayName ?? propertyName}
        isLoading={state.status === "loading"}
        onClose={onClose}
      />
      {match(state)
        .with({ status: "loading" }, () => <FieldDetailsSkeleton />)
        .with({ status: "error" }, ({ error }) => (
          <LoadingAndErrorWrapper loading={false} error={error} />
        ))
        .with({ status: "loaded" }, ({ registry }) =>
          property ? (
            <PropertyDetails
              table={table}
              property={property}
              registry={registry}
              resolved={resolved}
            />
          ) : (
            <EmptyState
              message={t`This table has no property called ${propertyName}.`}
              spacing="sm"
            />
          ),
        )
        .otherwise(() => (
          <EmptyState
            message={t`This table has no property called ${propertyName}.`}
            spacing="sm"
          />
        ))}
    </DetailPanel>
  );
}

function PropertyDetails({
  table,
  property,
  registry,
  resolved,
}: {
  table: Table;
  property: RegistryProperty;
  registry: PropertyRegistry;
  resolved: ResolvedEavBinding;
}) {
  const setOverrides = usePropertyOverrides(table);
  const save = (overrides: Parameters<typeof setOverrides>[1]) =>
    setOverrides(property.name, overrides);
  const definitionColumns = getDefinitionColumnNames(resolved);
  const noun = getEntityNoun(resolved.entityTable);
  const mergedIntoLabel =
    registry.properties.find(({ name }) => name === property.mergedInto)
      ?.displayName ?? property.mergedInto;
  const visibleSignals =
    property.mergedInto != null ? [] : getOpenSignals(property);
  const hasAlerts = visibleSignals.length > 0 || mergedIntoLabel != null;

  return (
    <Stack gap="xxl">
      {hasAlerts && (
        <SidebarSection title={t`Needs attention`}>
          <Stack gap="md">
            {mergedIntoLabel != null && (
              <MergedAlert
                property={property}
                mergedIntoLabel={mergedIntoLabel}
                onUndo={() => save({ mergedInto: undefined })}
              />
            )}
            {visibleSignals.map((signal) => (
              <SignalAlert
                key={signal.type}
                property={property}
                signal={signal}
                noun={noun}
                propertyColumn={resolved.propertyField?.name ?? t`the property`}
                onSave={save}
              />
            ))}
          </Stack>
        </SidebarSection>
      )}

      <SidebarSection title={t`Details`}>
        <DetailsTable>
          <DetailsRow
            label={t`Display name`}
            value={
              <DetailsEditableText
                initialValue={property.displayName}
                placeholder={t`Give this property a name`}
                maxLength={254}
                fw="bold"
                onChange={(displayName) =>
                  save({ displayName: displayName.trim() || undefined })
                }
              />
            }
          />
          <DetailsRow
            label={t`Label source`}
            value={
              <LabelSource
                property={property}
                definitionColumns={definitionColumns}
                onReset={() => save({ displayName: undefined })}
              />
            }
          />
          <DetailsRow
            label={t`Raw name`}
            value={<RawName property={property} resolved={resolved} />}
          />
          <DetailsRow
            label={t`Description`}
            value={
              <DetailsEditableText
                initialValue={property.description}
                placeholder={t`No description`}
                isMultiline
                isOptional
                onChange={(description) =>
                  save({ description: description.trim() })
                }
              />
            }
          />
          <DetailsRow
            label={t`Type`}
            value={
              <PropertyTypeInput
                property={property}
                definitionColumns={definitionColumns}
                onSave={save}
              />
            }
          />
          <DetailsRow
            label={t`Semantic type`}
            value={
              <Select
                py="xs"
                aria-label={t`Semantic type`}
                data={getPropertySemanticTypeOptions()}
                value={property.semanticType}
                placeholder={t`No semantic type`}
                clearable
                onChange={(value) => {
                  const option = getPropertySemanticTypeOptions().find(
                    (option) => option.value === value,
                  );
                  save({ semanticType: option?.value ?? null });
                }}
              />
            }
          />
          <DetailsRow
            label={t`Also called`}
            value={
              <Stack gap="xs" py="xs">
                <TagsInput
                  aria-label={t`Also called`}
                  value={property.synonyms}
                  placeholder={t`Add a synonym`}
                  onChange={(synonyms) => save({ synonyms })}
                />
                <Text size="sm" c="text-secondary">
                  {t`Search and Metabot match these words to this property.`}
                </Text>
              </Stack>
            }
          />
          <DetailsRow
            label={t`Visibility`}
            value={
              <Switch
                py="xs"
                label={t`Hide from people and Metabot`}
                checked={property.isHidden}
                onChange={(event) =>
                  save({ isHidden: event.currentTarget.checked })
                }
              />
            }
          />
        </DetailsTable>
      </SidebarSection>

      <SidebarSection title={t`Values`}>
        <DetailsTable>
          <DetailsRow
            label={t`Coverage`}
            value={
              <Stack gap="xs" py="xs">
                <Text c="text-primary">
                  {t`${formatShare(property.coverage)} of ${noun.plural} (${property.entityCount.toLocaleString()} of ${registry.entityCount.toLocaleString()})`}
                </Text>
                <Progress value={property.coverage * 100} size="sm" />
              </Stack>
            }
          />
          <DetailsRow
            label={t`Distinct values`}
            value={property.distinctValueCount.toLocaleString()}
          />
          {property.mergedFrom.length > 0 && (
            <DetailsRow
              label={t`Merged in`}
              value={property.mergedFrom.join(", ")}
            />
          )}
        </DetailsTable>
        <TopValues property={property} />
      </SidebarSection>
    </Stack>
  );
}

type DefinitionColumnNames = {
  table: string;
  label: string | null;
  type: string | null;
};

function getDefinitionColumnNames({
  definitionTable,
  binding,
}: ResolvedEavBinding): DefinitionColumnNames | null {
  if (!definitionTable) {
    return null;
  }
  const fields = definitionTable.fields ?? [];
  const nameOf = (fieldId: number | null) =>
    fields.find((field) => getRawTableFieldId(field) === fieldId)?.name ?? null;
  return {
    table: definitionTable.name,
    label: nameOf(binding.labelFieldId),
    type: nameOf(binding.typeFieldId),
  };
}

function LabelSource({
  property,
  definitionColumns,
  onReset,
}: {
  property: RegistryProperty;
  definitionColumns: DefinitionColumnNames | null;
  onReset: () => void;
}) {
  const definitionLabel = property.definition?.label;
  const labelColumn =
    definitionColumns?.label != null
      ? `${definitionColumns.table}.${definitionColumns.label}`
      : null;
  return (
    <Stack gap="xs" py="xs">
      {match(property.labelSource)
        .with("definition", () => (
          <Text c="text-primary">{t`From ${labelColumn ?? t`the definitions`}`}</Text>
        ))
        .with("admin", () => (
          <Text c="text-primary">
            {definitionLabel
              ? t`Edited by an admin. ${labelColumn ?? t`The definition`} says “${definitionLabel}”.`
              : t`Edited by an admin`}
          </Text>
        ))
        .with("values", () => (
          <Text c="text-primary">
            {definitionColumns
              ? t`Not in ${definitionColumns.table}, so there's no label`
              : t`The property name made readable`}
          </Text>
        ))
        .exhaustive()}
      {property.labelSource === "admin" && definitionLabel && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={onReset}
        >
          {t`Use “${definitionLabel}”`}
        </Button>
      )}
    </Stack>
  );
}

function RawName({
  property,
  resolved,
}: {
  property: RegistryProperty;
  resolved: ResolvedEavBinding;
}) {
  const propertyColumn = resolved.propertyField?.name;
  const showsKey = property.key !== property.name && propertyColumn != null;
  return (
    <Stack gap="xs" py="xs">
      <Code w="fit-content">{property.name}</Code>
      {showsKey && (
        <Text size="sm" c="text-secondary">
          {t`Rows where ${propertyColumn} is ${property.key}`}
        </Text>
      )}
    </Stack>
  );
}

function PropertyTypeInput({
  property,
  definitionColumns,
  onSave,
}: {
  property: RegistryProperty;
  definitionColumns: DefinitionColumnNames | null;
  onSave: (overrides: { type?: RegistryProperty["type"] }) => void;
}) {
  const declaredType = property.definition?.declaredType;
  const typeColumn =
    definitionColumns?.type != null
      ? `${definitionColumns.table}.${definitionColumns.type}`
      : null;
  return (
    <Stack gap="xs" py="xs">
      <Select
        aria-label={t`Type`}
        data={getPropertyTypeOptions()}
        value={property.type}
        allowDeselect={false}
        onChange={(value) => {
          const option = getPropertyTypeOptions().find(
            (option) => option.value === value,
          );
          if (option) {
            onSave({ type: option.value });
          }
        }}
      />
      <Text size="sm" c="text-secondary">
        {match(property.typeSource)
          .with(
            "definition",
            () =>
              t`From ${typeColumn ?? t`the definitions`}: ${declaredType ?? ""}. Values are stored as text and cast when queried.`,
          )
          .with("values", () =>
            declaredType == null && property.definition != null
              ? t`Its definition has no type, so it's inferred: most values read as ${getPropertyTypeLabel(property.inferredType)}.`
              : t`Inferred: most values read as ${getPropertyTypeLabel(property.inferredType)}. Values are stored as text and cast when queried.`,
          )
          .with(
            "admin",
            () =>
              t`Set by an admin. The default is ${getPropertyTypeLabel(property.inferredType)}.`,
          )
          .exhaustive()}
      </Text>
      <TypeDriftHint property={property} />
      {property.typeSource === "admin" && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={() => onSave({ type: undefined })}
        >
          {t`Use the default type (${getPropertyTypeLabel(property.inferredType)})`}
        </Button>
      )}
    </Stack>
  );
}

function TypeDriftHint({ property }: { property: RegistryProperty }) {
  const drift = property.signals.find(({ type }) => type === "type-drift");
  if (drift?.type !== "type-drift") {
    return null;
  }
  return (
    <Text size="sm" c="text-secondary">
      {t`${drift.nonConformingCount.toLocaleString()} values don't fit ${getPropertyTypeLabel(property.type).toLowerCase()}. A generated data quality check flags them.`}
    </Text>
  );
}

type SignalOverrides = {
  isHidden?: boolean;
  mergedInto?: string;
};

function SignalAlert({
  property,
  signal,
  noun,
  propertyColumn,
  onSave,
}: {
  property: RegistryProperty;
  signal: OpenPropertySignal;
  noun: ReturnType<typeof getEntityNoun>;
  propertyColumn: string;
  onSave: (overrides: SignalOverrides) => void;
}) {
  return match(signal)
    .with({ type: "undefined" }, () => (
      <Alert
        color="warning"
        variant="light"
        icon={<Icon name="warning" />}
        title={t`Definition not found`}
      >
        <Stack gap="sm">
          <Text>
            {t`${property.entityCount.toLocaleString()} ${noun.plural} have values where ${propertyColumn} is ${property.key}, but the definitions table has no row for ${property.key}.`}
          </Text>
          <Group gap="xs">
            <Text size="sm" c="text-secondary">{t`Sample values`}</Text>
            {property.topValues.slice(0, 3).map(({ value }) => (
              <Code key={value}>{value}</Code>
            ))}
          </Group>
          <Group gap="sm">
            <Button
              size="compact-sm"
              onClick={() => onSave({ isHidden: !property.isHidden })}
            >
              {property.isHidden
                ? t`Show to people and Metabot`
                : t`Hide from people and Metabot`}
            </Button>
          </Group>
        </Stack>
      </Alert>
    ))
    .with({ type: "unused" }, () => (
      <Alert
        variant="light"
        icon={<Icon name="info" />}
        title={t`No values yet`}
      >
        <Text>{t`It's defined, but no ${noun.singular} has a value yet.`}</Text>
      </Alert>
    ))
    .with({ type: "duplicate" }, ({ propertyName, propertyLabel }) => (
      <Alert
        color="warning"
        variant="light"
        icon={<Icon name="copy" />}
        title={t`Might be the same as ${propertyLabel}`}
      >
        <Stack gap="sm">
          <Text>
            {t`Most of its values match ${propertyLabel}'s in other casing, and they're on different ${noun.plural}. Merging shows both as one ${propertyLabel} column. You can undo it.`}
          </Text>
          <Group gap="sm">
            <Button
              size="compact-sm"
              onClick={() => onSave({ mergedInto: propertyName })}
            >
              {t`Merge into ${propertyLabel}`}
            </Button>
          </Group>
        </Stack>
      </Alert>
    ))
    .exhaustive();
}

function MergedAlert({
  property,
  mergedIntoLabel,
  onUndo,
}: {
  property: RegistryProperty;
  mergedIntoLabel: string;
  onUndo: () => void;
}) {
  return (
    <Alert
      variant="light"
      color="core-brand"
      icon={<Icon name="check" />}
      title={t`Merged into ${mergedIntoLabel}`}
    >
      <Stack gap="sm">
        <Text>
          {t`Its ${property.entityCount.toLocaleString()} values now show in the ${mergedIntoLabel} column, and ${property.displayName} isn't listed on its own.`}
        </Text>
        <Group gap="sm">
          <Button size="compact-sm" onClick={onUndo}>
            {t`Undo merge`}
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}

function TopValues({ property }: { property: RegistryProperty }) {
  const shownValues = property.topValues.slice(0, MAX_SHOWN_VALUES);
  const driftSignal = property.signals.find(
    (signal) => signal.type === "type-drift",
  );
  const badValues = new Set(
    driftSignal?.type === "type-drift" ? driftSignal.examples : [],
  );

  return (
    <Stack gap="sm">
      <Text size="sm" c="text-secondary">
        {t`Most common values`}
      </Text>
      <DetailsTable>
        {shownValues.map(({ value, entityCount }) => {
          // Share of the entities that have this property, not of all entities
          const share =
            property.entityCount > 0 ? entityCount / property.entityCount : 0;
          return (
            <DetailsRow
              key={value}
              label={value === "" ? t`(empty)` : value}
              value={
                <Group gap="sm" wrap="nowrap" justify="space-between">
                  <Progress
                    flex={1}
                    size="sm"
                    color={
                      badValues.has(value) ? "feedback-warning" : "core-brand"
                    }
                    value={share * 100}
                  />
                  <Text c="text-secondary" ta="right" flex="0 0 auto">
                    {`${formatShare(share)} · ${entityCount.toLocaleString()}`}
                  </Text>
                </Group>
              }
            />
          );
        })}
      </DetailsTable>
    </Stack>
  );
}
