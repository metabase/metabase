import type { Ref } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { dayjs } from "metabase/dayjs";
import {
  type PropertySignal,
  type RegistryProperty,
  usePropertyOverrides,
  usePropertyRegistry,
  useTableStructures,
} from "metabase/metadata/table-structure";
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
  formatShare,
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
  const { getTableStructure } = useTableStructures();
  const state = usePropertyRegistry(table, getTableStructure(table).eav);
  const property =
    state.status === "loaded"
      ? state.registry.properties.find(({ name }) => name === propertyName)
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
        label={t`Property of ${table.display_name}`}
        title={property?.displayName ?? propertyName}
        isLoading={state.status === "loading"}
        onClose={onClose}
      />
      {property ? (
        <PropertyDetails table={table} property={property} />
      ) : (
        <FieldDetailsSkeleton />
      )}
    </DetailPanel>
  );
}

function PropertyDetails({
  table,
  property,
}: {
  table: Table;
  property: RegistryProperty;
}) {
  const setOverrides = usePropertyOverrides(table);
  const save = (overrides: Parameters<typeof setOverrides>[1]) =>
    setOverrides(property.name, overrides);
  const visibleSignals = property.signals.filter(
    (signal) => signal.type !== "stale" || property.isHidden,
  );

  return (
    <Stack gap="xxl">
      {visibleSignals.length > 0 && (
        <SidebarSection title={t`Needs attention`}>
          <Stack gap="md">
            {visibleSignals.map((signal) => (
              <SignalAlert
                key={signal.type}
                property={property}
                signal={signal}
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
            label={t`Raw name`}
            value={<Code>{property.name}</Code>}
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
            value={<PropertyTypeInput property={property} onSave={save} />}
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
                  {t`${formatShare(property.coverage)} of entities (${property.entityCount.toLocaleString()})`}
                </Text>
                <Progress value={property.coverage * 100} size="sm" />
              </Stack>
            }
          />
          <DetailsRow
            label={t`Distinct values`}
            value={property.distinctValueCount.toLocaleString()}
          />
          <DetailsRow
            label={t`First seen`}
            value={formatDate(property.firstSeen)}
          />
          <DetailsRow
            label={t`Last seen`}
            value={formatDate(property.lastSeen)}
          />
        </DetailsTable>
        <TopValues property={property} />
      </SidebarSection>
    </Stack>
  );
}

function PropertyTypeInput({
  property,
  onSave,
}: {
  property: RegistryProperty;
  onSave: (overrides: { type?: RegistryProperty["type"] }) => void;
}) {
  const isOverridden = property.type !== property.inferredType;
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
        {isOverridden
          ? t`Set by an admin. Values read as ${getPropertyTypeLabel(property.inferredType)}.`
          : t`Inferred: most values read as ${getPropertyTypeLabel(property.inferredType)}. Values are stored as text and cast when queried.`}
      </Text>
      {isOverridden && (
        <Button
          size="compact-sm"
          variant="subtle"
          w="fit-content"
          px={0}
          onClick={() => onSave({ type: undefined })}
        >
          {t`Use the inferred type (${getPropertyTypeLabel(property.inferredType)})`}
        </Button>
      )}
    </Stack>
  );
}

function SignalAlert({
  property,
  signal,
  onSave,
}: {
  property: RegistryProperty;
  signal: PropertySignal;
  onSave: (overrides: {
    isHidden?: boolean;
    mergedInto?: string;
    type?: RegistryProperty["type"];
  }) => void;
}) {
  return match(signal)
    .with({ type: "new" }, () => (
      <Alert
        color="core-brand"
        variant="light"
        icon={<Icon name="sparkles" />}
        title={t`New property`}
      >
        <Stack gap="sm">
          <Text>
            {t`Started arriving ${formatDate(property.firstSeen)} on ${property.entityCount.toLocaleString()} entities. Add a description so people and Metabot know what it means.`}
          </Text>
          <Group gap="sm">
            <Button
              size="compact-sm"
              onClick={() => onSave({ isHidden: true })}
            >
              {t`Hide it for now`}
            </Button>
          </Group>
        </Stack>
      </Alert>
    ))
    .with({ type: "type-drift" }, ({ nonConformingCount, examples }) => (
      <Alert
        color="warning"
        variant="light"
        icon={<Icon name="warning" />}
        title={t`${nonConformingCount.toLocaleString()} values aren't ${getPropertyTypeLabel(property.type).toLowerCase()}s`}
      >
        <Stack gap="sm">
          <Text>
            {t`For example ${examples
              .slice(0, 3)
              .map((example) => `"${example}"`)
              .join(
                ", ",
              )}. They're left out when people filter or summarize ${property.displayName} as a number, and the filter says so.`}
          </Text>
          <Group gap="sm">
            <Button size="compact-sm" onClick={() => onSave({ type: "text" })}>
              {t`Treat as text`}
            </Button>
          </Group>
        </Stack>
      </Alert>
    ))
    .with({ type: "duplicate" }, ({ propertyName }) => (
      <Alert
        color="warning"
        variant="light"
        icon={<Icon name="copy" />}
        title={t`Looks like ${propertyName}`}
      >
        <Stack gap="sm">
          <Text>
            {t`Its values match ${propertyName}'s in other casing, on different entities. Merging shows both as one ${propertyName} column.`}
          </Text>
          <Group gap="sm">
            <Button
              size="compact-sm"
              variant="filled"
              onClick={() =>
                onSave({ mergedInto: propertyName, isHidden: true })
              }
            >
              {t`Merge into ${propertyName}`}
            </Button>
          </Group>
        </Stack>
      </Alert>
    ))
    .with({ type: "stale" }, () => (
      <Alert
        variant="light"
        icon={<Icon name="clock" />}
        title={t`No new values since ${formatDate(property.lastSeen)}`}
      >
        <Stack gap="sm">
          <Text>{t`Hidden from people and Metabot because it stopped arriving.`}</Text>
          <Group gap="sm">
            <Button
              size="compact-sm"
              onClick={() => onSave({ isHidden: false })}
            >
              {t`Show it anyway`}
            </Button>
          </Group>
        </Stack>
      </Alert>
    ))
    .exhaustive();
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

const formatDate = (date: string | null) =>
  date ? dayjs(date).format("MMM D, YYYY") : t`Unknown`;
