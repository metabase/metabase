/* eslint-disable boundaries/element-types -- throwaway prototype: reuses the Metric Explorer's per-term dimension select. */
import { useState } from "react";

import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { MetricDimensionSelect } from "metabase/metrics-viewer/components/DimensionPickerSidebar/components/MetricDimensionSelect";
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";

import { LineChart } from "../Sparkline";
import { formatNumber } from "../data";

import { CategoryButton } from "./CategoryButton";
import {
  COUNTRIES,
  INITIAL_DIMENSIONS,
  type MetricDimension,
  SIGNUP_TIME,
  TERMS,
  columnOf,
  isConforming,
  seriesFor,
  unsharedColumns,
} from "./data";

/**
 * Prototype: a metric over two unrelated tables states which column of each
 * term every dimension reads, reusing the Break out sidebar's per-term
 * selects, and which of those dimensions it publishes downstream.
 */
export function DimensionMappingPrototype() {
  const [dimensions, setDimensions] =
    useState<MetricDimension[]>(INITIAL_DIMENSIONS);
  const [selectedId, setSelectedId] = useState("time");
  const [expandedId, setExpandedId] = useState<string | null>("time");

  const update = (id: string, change: Partial<MetricDimension>) =>
    setDimensions((current) =>
      current.map((dimension) => {
        if (dimension.id !== id) {
          return dimension;
        }
        const next = { ...dimension, ...change };
        return { ...next, published: next.published && isConforming(next) };
      }),
    );

  const selected =
    dimensions.find((dimension) => dimension.id === selectedId) ??
    dimensions[0];
  const published = dimensions.filter((dimension) => dimension.published);
  const unshared = unsharedColumns(dimensions);
  const hasSignupTime = dimensions.some(
    (dimension) => dimension.id === SIGNUP_TIME.id,
  );

  return (
    <PageContainer pt="md" h="auto">
      <Card withBorder shadow="none" p={0}>
        <Flex mih={640}>
          <Stack flex={1} p="lg" gap="lg" miw={0}>
            <Stack gap="xs">
              <Title order={3}>Revenue per active user</Title>
              <Group gap="xs">
                <TermBadge index={0} />
                <Text c="text-secondary">÷</Text>
                <TermBadge index={1} />
              </Group>
            </Stack>
            <Group gap="xs">
              <Text fw={700}>This metric publishes:</Text>
              {published.length > 0 ? (
                published.map((dimension) => (
                  <Badge key={dimension.id} variant="light">
                    {dimension.name}
                  </Badge>
                ))
              ) : (
                <Text c="text-secondary">nothing</Text>
              )}
            </Group>
            <Box>
              <Text fw={700} mb="xs">
                By {selected.name}
              </Text>
              <MappingCaption dimension={selected} />
              <Chart dimension={selected} />
            </Box>
          </Stack>

          <Stack
            w="22rem"
            p="md"
            gap="xs"
            style={{ borderLeft: "1px solid var(--mb-color-border-neutral)" }}
          >
            <Text fw={700}>Dimensions</Text>
            <Text fz="sm" c="text-secondary">
              Choose which column of each measure a dimension reads, and which
              dimensions the metric publishes.
            </Text>
            <Group justify="space-between" mt="sm">
              <Text fz="sm" fw={700} c="text-secondary">
                Shared dimensions
              </Text>
              <Text fz="sm" fw={700} c="text-secondary">
                Published
              </Text>
            </Group>
            {dimensions.map((dimension) => (
              <DimensionItem
                key={dimension.id}
                dimension={dimension}
                isSelected={dimension.id === selected.id}
                isExpanded={dimension.id === expandedId}
                onSelect={() => setSelectedId(dimension.id)}
                onToggleExpanded={() =>
                  setExpandedId(
                    dimension.id === expandedId ? null : dimension.id,
                  )
                }
                onChange={(change) => update(dimension.id, change)}
              />
            ))}
            {!hasSignupTime && (
              <Button
                variant="subtle"
                size="compact-sm"
                leftSection={<Icon name="add" />}
                style={{ alignSelf: "flex-start" }}
                onClick={() => {
                  setDimensions((current) => [...current, SIGNUP_TIME]);
                  setSelectedId(SIGNUP_TIME.id);
                  setExpandedId(SIGNUP_TIME.id);
                }}
              >
                Add a time dimension
              </Button>
            )}

            <Text fz="sm" fw={700} c="text-secondary" mt="md">
              Not shared
            </Text>
            <Text fz="sm" c="text-secondary">
              Only one measure has these, so the metric can’t be broken out by
              them and they can’t be published. Filter that measure in the
              definition instead.
            </Text>
            {unshared.map(({ term, column }) => (
              <Group key={column.id} gap="sm" px="sm" h="2rem" wrap="nowrap">
                <Icon name="string" c="text-secondary" />
                <Text fz="sm" c="text-secondary" flex={1} truncate>
                  {column.name}
                </Text>
                <Text fz="xs" c="text-secondary">
                  Only {term.name}
                </Text>
              </Group>
            ))}
          </Stack>
        </Flex>
      </Card>
    </PageContainer>
  );
}

function TermBadge({ index }: { index: number }) {
  const term = TERMS[index];
  return (
    <Badge
      variant="outline"
      leftSection={
        <Box w={8} h={8} bg={term.color} style={{ borderRadius: "50%" }} />
      }
    >
      {term.name}
    </Badge>
  );
}

function DimensionItem({
  dimension,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpanded,
  onChange,
}: {
  dimension: MetricDimension;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpanded: () => void;
  onChange: (change: Partial<MetricDimension>) => void;
}) {
  const conforming = isConforming(dimension);
  const missing = TERMS.filter((term) => dimension.mapping[term.id] == null);
  const missingText = `${missing.map((term) => term.name).join(", ")} has no column mapped, so it can’t be published.`;

  return (
    <Box>
      <Group gap="xs" wrap="nowrap">
        <Box flex={1} miw={0}>
          <CategoryButton
            name={dimension.name}
            icon={dimension.kind === "date" ? "calendar" : "string"}
            note={conforming ? undefined : "Not conforming"}
            isSelected={isSelected}
            isExpanded={isExpanded}
            onClick={onSelect}
            onConfigure={onToggleExpanded}
          />
        </Box>
        <Tooltip label={missingText} disabled={conforming}>
          <Box px="sm">
            <Checkbox
              aria-label={`Publish ${dimension.name}`}
              checked={dimension.published}
              disabled={!conforming}
              onChange={(event) =>
                onChange({ published: event.currentTarget.checked })
              }
            />
          </Box>
        </Tooltip>
      </Group>
      {isExpanded && (
        <Stack gap="xxs" pl="2rem" pr="2.5rem" pt="0.375rem" pb="0.625rem">
          {TERMS.map((term, slotIndex) => (
            <MetricDimensionSelect
              key={term.id}
              row={{
                slotIndex,
                sourceId: `metric:${slotIndex}`,
                metricName: term.name,
                colors: [term.color],
                isExpressionToken: false,
                value: dimension.mapping[term.id] ?? null,
                options: term.columns
                  .filter((column) => column.kind === dimension.kind)
                  .map((column) => ({
                    value: column.id,
                    label: column.label,
                    icon: column.kind === "date" ? "calendar" : "string",
                  })),
              }}
              onChange={(columnId) =>
                onChange({
                  mapping: { ...dimension.mapping, [term.id]: columnId },
                })
              }
            />
          ))}
          {!conforming && (
            <Text fz="xs" c="text-secondary" pt="xs">
              {missingText}
            </Text>
          )}
        </Stack>
      )}
    </Box>
  );
}

function MappingCaption({ dimension }: { dimension: MetricDimension }) {
  const parts = TERMS.map((term) => {
    const column = columnOf(term, dimension.mapping[term.id]);
    return `${term.name} by ${column?.label ?? "nothing"}`;
  });
  return (
    <Text fz="sm" c="text-secondary" mb="md">
      {parts.join(" · ")}
    </Text>
  );
}

function Chart({ dimension }: { dimension: MetricDimension }) {
  const values = seriesFor(dimension);
  if (!values) {
    return (
      <Stack
        align="center"
        justify="center"
        h={240}
        gap="xs"
        bg="background-secondary"
        style={{ borderRadius: "0.5rem" }}
      >
        <Icon name="warning" c="text-secondary" />
        <Text c="text-secondary" ta="center" maw="28rem">
          Not every measure reads {dimension.name}, so the metric can’t be
          broken out by it. Map a column for each measure to make it conform.
        </Text>
      </Stack>
    );
  }
  if (dimension.kind === "date") {
    return <LineChart values={values} />;
  }
  const max = Math.max(...values);
  return (
    <Stack gap={6} py="sm">
      {COUNTRIES.map((country, i) => (
        <Group key={country} gap="sm" wrap="nowrap">
          <Text size="sm" w={120}>
            {country}
          </Text>
          <Box
            h={18}
            w={`${(values[i] / max) * 70}%`}
            bg="brand"
            style={{ borderRadius: 2 }}
          />
          <Text size="xs" c="text-secondary">
            {formatNumber(values[i])}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
