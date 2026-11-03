import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  type RegistryProperty,
  useEavBinding,
  usePropertyRegistry,
} from "metabase/metadata/table-structure";
import {
  Card,
  Flex,
  Group,
  Icon,
  Progress,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  rem,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

import {
  PropertySignalBadge,
  formatShare,
  getEntityNoun,
  getMissingBindingMessage,
  getOpenSignals,
  getPropertyIcon,
  getPropertyTypeDescription,
  needsAttention,
} from "../../PropertyDetailsPanel/property-labels";
import { usePropertySelection } from "../../contexts/PropertySelectionContext";

import S from "./TablePropertyList.module.css";

type PropertyFilter = "all" | "attention" | "hidden";

const MAX_LISTED_VALUES = 4;

export function TablePropertyList({ table }: { table: Table }) {
  const state = usePropertyRegistry(table);
  const noun = getEntityNoun(useEavBinding(table).entityTable);
  const { selectedPropertyName, setSelectedPropertyName } =
    usePropertySelection();
  const [filter, setFilter] = useState<PropertyFilter>("all");
  const [search, setSearch] = useState("");

  if (state.status === "unbound") {
    return <EmptyState message={getMissingBindingMessage()} spacing="sm" />;
  }
  if (state.status !== "loaded") {
    return (
      <LoadingAndErrorWrapper
        loading={state.status === "loading"}
        error={state.status === "error" ? state.error : null}
      />
    );
  }

  const { properties } = state.registry;
  const attentionCount = properties.filter(needsAttention).length;
  const hiddenCount = properties.filter((property) => property.isHidden).length;
  const visibleProperties = properties
    .filter((property) =>
      `${property.name} ${property.displayName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .filter((property) => {
      if (filter === "attention") {
        return needsAttention(property);
      }
      if (filter === "hidden") {
        return property.isHidden;
      }
      return true;
    });

  return (
    <Stack gap="lg">
      <Stack gap="md">
        <TextInput
          leftSection={<Icon name="search" />}
          placeholder={t`Search custom properties`}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <SegmentedControl
          fullWidth
          value={filter}
          onChange={(value) => {
            if (
              value === "all" ||
              value === "attention" ||
              value === "hidden"
            ) {
              setFilter(value);
            }
          }}
          data={[
            { value: "all", label: t`All ${properties.length}` },
            { value: "attention", label: t`Needs attention ${attentionCount}` },
            { value: "hidden", label: t`Hidden ${hiddenCount}` },
          ]}
        />
      </Stack>
      <Text size="sm" c="text-secondary">
        {state.registry.hasDefinitions
          ? t`Labels and types come from the definitions table. Coverage is the share of all ${state.registry.entityCount.toLocaleString()} ${noun.plural} with a value.`
          : t`There's no definitions table, so labels and types are inferred from ${state.registry.rowCount.toLocaleString()} values. Coverage is the share of all ${state.registry.entityCount.toLocaleString()} ${noun.plural} with a value.`}
      </Text>
      <Stack gap="sm" role="list">
        {visibleProperties.map((property) => (
          <PropertyItem
            key={property.key}
            property={property}
            mergedIntoLabel={
              properties.find(({ name }) => name === property.mergedInto)
                ?.displayName
            }
            active={property.key === selectedPropertyName}
            onSelect={() => setSelectedPropertyName(property.key)}
          />
        ))}
      </Stack>
    </Stack>
  );
}

function PropertyItem({
  property,
  mergedIntoLabel,
  active,
  onSelect,
}: {
  property: RegistryProperty;
  mergedIntoLabel: string | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  const valuesLabel = getValuesLabel(property);

  return (
    <Card
      className={cx(S.card, {
        [S.active]: active,
        [S.hidden]: property.isHidden,
      })}
      bg={
        active ? "background_surface-brand-subtle" : "background_page-primary"
      }
      c="text-secondary"
      role="listitem"
      p={0}
      withBorder
    >
      <UnstyledButton
        className={S.button}
        aria-label={property.displayName}
        px="lg"
        py={rem(12)}
        w="100%"
        onClick={onSelect}
      >
        <Flex gap="md" align="center" wrap="nowrap">
          <Icon name={getPropertyIcon(property)} flex="0 0 auto" />
          <Stack gap={rem(2)} flex={1} miw={0}>
            <Group gap="sm" wrap="nowrap">
              <Text fw="bold" c="text-primary" lineClamp={1}>
                {property.displayName}
              </Text>
              <Text
                size="sm"
                c="text-secondary-opaque"
                ff="monospace"
                lineClamp={1}
              >
                {property.name}
              </Text>
            </Group>
            <Text size="sm" c="text-secondary" lineClamp={1}>
              {getPropertyTypeDescription(property)}
              {" · "}
              {valuesLabel}
            </Text>
          </Stack>
          <Group gap="xs" wrap="nowrap" flex="0 0 auto">
            {property.mergedInto != null && (
              <Text size="sm" c="text-secondary-opaque">
                {t`Merged into ${mergedIntoLabel ?? property.mergedInto}`}
              </Text>
            )}
            {property.isHidden && property.mergedInto == null && (
              <Text size="sm" c="text-secondary-opaque">{t`Hidden`}</Text>
            )}
            {!property.isHidden &&
              property.mergedInto == null &&
              getOpenSignals(property).map((signal) => (
                <PropertySignalBadge key={signal.type} signal={signal} />
              ))}
          </Group>
          <Stack gap={rem(4)} w={rem(72)} flex="0 0 auto" align="flex-end">
            <Text size="sm" c="text-primary" fw="bold">
              {formatShare(property.coverage)}
            </Text>
            <Progress value={property.coverage * 100} size="sm" w="100%" />
          </Stack>
        </Flex>
      </UnstyledButton>
    </Card>
  );
}

function getValuesLabel(property: RegistryProperty) {
  if (property.distinctValueCount === 0) {
    return t`No values yet`;
  }
  if (property.distinctValueCount <= MAX_LISTED_VALUES) {
    return property.topValues
      .slice(0, MAX_LISTED_VALUES)
      .map(({ value }) => value)
      .join(", ");
  }
  return t`${property.distinctValueCount.toLocaleString()} values`;
}
