import { useDisclosure } from "@mantine/hooks";
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
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Icon,
  Input,
  Popover,
  Progress,
  Repeat,
  Skeleton,
  Stack,
  Text,
  Tooltip,
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
  needsAttention,
} from "../../PropertyDetailsPanel/property-labels";
import { usePropertySelection } from "../../contexts/PropertySelectionContext";

import S from "./TablePropertyList.module.css";

type PropertyFilters = {
  needsAttention: boolean;
  hidden: boolean;
};

const EMPTY_FILTERS: PropertyFilters = { needsAttention: false, hidden: false };

/** No filters shows every property; otherwise those matching any checked filter */
function matchesFilters(property: RegistryProperty, filters: PropertyFilters) {
  if (!filters.needsAttention && !filters.hidden) {
    return true;
  }
  return (
    (filters.needsAttention && needsAttention(property)) ||
    (filters.hidden && property.isHidden)
  );
}

const SKELETON_ITEM_COUNT = 6;

/** Loading placeholder shaped like the profile line, search row and property cards */
function PropertyListSkeleton() {
  return (
    <Stack gap="lg" data-testid="table-property-list-skeleton">
      <Skeleton h={14} w="60%" />
      <Group gap="sm" wrap="nowrap">
        <Skeleton h={rem(40)} flex={1} />
        <Skeleton h={rem(40)} w={rem(40)} />
      </Group>
      <Stack gap={rem(12)}>
        <Repeat times={SKELETON_ITEM_COUNT}>
          <Group
            className={S.skeletonCard}
            gap="sm"
            px="lg"
            py={rem(12)}
            wrap="nowrap"
          >
            <Skeleton h={16} w={16} circle />
            <Skeleton h={16} w="40%" />
            <Skeleton h={14} w={rem(108)} ml="auto" />
          </Group>
        </Repeat>
      </Stack>
    </Stack>
  );
}

export function TablePropertyList({ table }: { table: Table }) {
  const state = usePropertyRegistry(table);
  const noun = getEntityNoun(useEavBinding(table).entityTable);
  const { selectedPropertyName, setSelectedPropertyName } =
    usePropertySelection(table.id);
  const [filters, setFilters] = useState<PropertyFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [isFilterOpen, { toggle: toggleFilter, close: closeFilter }] =
    useDisclosure();

  if (state.status === "unbound") {
    return <EmptyState message={getMissingBindingMessage()} spacing="sm" />;
  }
  if (state.status === "loading") {
    return <PropertyListSkeleton />;
  }
  if (state.status === "error") {
    return <LoadingAndErrorWrapper loading={false} error={state.error} />;
  }

  const { properties } = state.registry;
  const hasFilters = filters.needsAttention || filters.hidden;
  const visibleProperties = properties.filter(
    (property) =>
      `${property.name} ${property.displayName}`
        .toLowerCase()
        .includes(search.toLowerCase()) && matchesFilters(property, filters),
  );

  return (
    <Stack gap="lg">
      <Text size="sm" c="text-secondary">
        {state.registry.hasDefinitions
          ? t`Labels and types come from the definitions table. Coverage is the share of all ${state.registry.entityCount.toLocaleString()} ${noun.plural} with a value.`
          : t`There's no definitions table, so labels and types are inferred from ${state.registry.rowCount.toLocaleString()} values. Coverage is the share of all ${state.registry.entityCount.toLocaleString()} ${noun.plural} with a value.`}
      </Text>
      <Group gap="sm" wrap="nowrap">
        <Input
          flex="1"
          leftSection={<Icon name="search" />}
          placeholder={t`Search custom properties`}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <Popover
          width={rem(280)}
          position="bottom-end"
          opened={isFilterOpen}
          onChange={toggleFilter}
        >
          <Popover.Target>
            <Tooltip label={t`Filter`} disabled={isFilterOpen}>
              <Button
                aria-label={t`Filter`}
                leftSection={
                  <Box pos="relative">
                    <Icon name="filter" />
                    {hasFilters && (
                      <Badge
                        color="brand"
                        indicator
                        pos="absolute"
                        top={-6}
                        right={-8}
                      />
                    )}
                  </Box>
                }
                size="lg"
                onClick={toggleFilter}
              />
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <PropertyFilterPopover
              filters={filters}
              attentionCount={properties.filter(needsAttention).length}
              hiddenCount={
                properties.filter((property) => property.isHidden).length
              }
              onSubmit={(newFilters) => {
                setFilters(newFilters);
                closeFilter();
              }}
            />
          </Popover.Dropdown>
        </Popover>
      </Group>
      {visibleProperties.length === 0 ? (
        <EmptyState message={t`No properties match`} spacing="sm" />
      ) : (
        <Stack gap={rem(12)} role="list">
          {visibleProperties.map((property) => (
            <PropertyItem
              key={property.key}
              property={property}
              mergedIntoLabel={
                properties.find(({ name }) => name === property.mergedInto)
                  ?.displayName
              }
              totalEntityCount={state.registry.entityCount}
              entityPlural={noun.plural}
              active={property.key === selectedPropertyName}
              onSelect={() => setSelectedPropertyName(property.key)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function PropertyFilterPopover({
  filters,
  attentionCount,
  hiddenCount,
  onSubmit,
}: {
  filters: PropertyFilters;
  attentionCount: number;
  hiddenCount: number;
  onSubmit: (filters: PropertyFilters) => void;
}) {
  const [form, setForm] = useState(filters);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <Stack gap="xxl" p="xl">
        <Stack gap="md">
          <Text fw="bold">{t`Show`}</Text>
          <Checkbox
            label={t`Needs attention (${attentionCount})`}
            checked={form.needsAttention}
            onChange={(event) =>
              setForm((form) => ({
                ...form,
                needsAttention: event.target.checked,
              }))
            }
          />
          <Checkbox
            label={t`Hidden (${hiddenCount})`}
            checked={form.hidden}
            onChange={(event) =>
              setForm((form) => ({ ...form, hidden: event.target.checked }))
            }
          />
        </Stack>

        <Group justify="space-between" wrap="nowrap">
          <Button flex={1} onClick={() => onSubmit(EMPTY_FILTERS)}>
            {t`Clear filters`}
          </Button>
          <Button flex={1} variant="filled" type="submit">
            {t`Apply`}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function PropertyItem({
  property,
  mergedIntoLabel,
  totalEntityCount,
  entityPlural,
  active,
  onSelect,
}: {
  property: RegistryProperty;
  mergedIntoLabel: string | undefined;
  totalEntityCount: number;
  entityPlural: string;
  active: boolean;
  onSelect: () => void;
}) {
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
      pb={1}
      withBorder
    >
      <UnstyledButton
        className={S.button}
        aria-label={property.displayName}
        mih={rem(40)}
        px="lg"
        py={rem(12)}
        w="100%"
        onClick={onSelect}
      >
        <Group gap={0} wrap="nowrap">
          <Icon
            className={S.icon}
            flex="0 0 auto"
            mr="sm"
            name={getPropertyIcon(property)}
          />
          <Text fw="bold" c="text-primary" lineClamp={1} flex={1} miw={0}>
            {property.displayName}
          </Text>
          <Group gap="xs" wrap="nowrap" flex="0 0 auto" ml="sm">
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
          <Tooltip
            label={t`Coverage: ${formatShare(property.coverage)} of all ${entityPlural} have this property (${property.entityCount.toLocaleString()} of ${totalEntityCount.toLocaleString()}).`}
            multiline
            w={rem(240)}
          >
            <Group gap="sm" wrap="nowrap" flex="0 0 auto" ml="md">
              <Progress
                value={property.coverage * 100}
                size="sm"
                w={rem(64)}
                aria-label={t`Coverage`}
              />
              <Text size="sm" c="text-primary" fw="bold" w={rem(36)} ta="right">
                {formatShare(property.coverage)}
              </Text>
            </Group>
          </Tooltip>
        </Group>
      </UnstyledButton>
    </Card>
  );
}
