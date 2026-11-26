import type { ReactNode } from "react";

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type { Kind } from "./catalog";
import {
  type Dimension,
  type DimensionMapping,
  type MetricDimensions,
  type Pill,
  type Tier,
  mapDimension,
  pillDimensionFor,
  unmapDimension,
} from "./dimensions";

const KIND_ICONS: Record<Kind, IconName> = {
  string: "string",
  number: "int",
  boolean: "io",
  date: "calendar",
};

const TIER_LABELS: Record<Tier, string> = {
  field: "Same field",
  name: "Same name and type",
  semantic: "Mapped by you",
};

/** Where the pill reads the dimension from: "Orders · Product → Category". */
function columnText(pill: Pill, dimension: Dimension) {
  const own = pillDimensionFor(pill, dimension);
  if (!own) {
    return null;
  }
  const [column] = own.columns;
  if (own.columns.length > 1 || !column) {
    return own.label;
  }
  const name = column.via ? `${column.via} → ${column.column}` : column.column;
  return `${column.table} · ${name}`;
}

/**
 * Prototype: the dimensions of a metric that is math over pills. A dimension
 * needs a column in every pill; the editor maps the obvious ones and suggests
 * the rest. What only some pills have still filters those pills.
 */
export function DimensionsTab({
  pills,
  dimensions,
  mapping,
  onChange,
}: {
  pills: Pill[];
  dimensions: MetricDimensions;
  mapping: DimensionMapping;
  onChange: (mapping: DimensionMapping) => void;
}) {
  if (pills.length === 0) {
    return (
      <Text p="xl" c="text-secondary">
        Add a measure to the definition to see its dimensions.
      </Text>
    );
  }
  const isMath = pills.length > 1;
  const { mapped, suggested, unshared } = dimensions;
  const columns = `minmax(12rem, 1.2fr) repeat(${pills.length}, minmax(11rem, 1fr)) minmax(14rem, auto)`;

  const row = (dimension: Dimension, action: ReactNode) => (
    <Row key={dimension.id} columns={columns}>
      <Cell>
        <Icon name={KIND_ICONS[dimension.kind]} c="text-secondary" />
        <Text fw={700} truncate>
          {dimension.label}
        </Text>
      </Cell>
      {pills.map((pill) => (
        <Cell key={pill.id}>
          <Text c="text-secondary" truncate>
            {columnText(pill, dimension) ?? "—"}
          </Text>
        </Cell>
      ))}
      <Cell justify="flex-end">{action}</Cell>
    </Row>
  );

  return (
    <Card withBorder shadow="none" p="lg">
      <Stack gap="lg">
        <Text c="text-secondary" maw="44rem">
          {isMath
            ? "A dimension is something the whole metric can be filtered and broken out by, so it needs a column in every measure. The same column, or one with the same name, is mapped already."
            : "What this metric can be filtered and broken out by."}
        </Text>
        <Box>
          <Row columns={columns} isHeader>
            <Cell>
              <Text fz="sm" fw={700} c="text-secondary">
                Dimension
              </Text>
            </Cell>
            {pills.map((pill) => (
              <Cell key={pill.id}>
                <Text fz="sm" fw={700} c="text-secondary" truncate>
                  {pill.name}
                </Text>
              </Cell>
            ))}
            <Cell />
          </Row>

          <Section title="In this metric" count={mapped.length}>
            {mapped.map((dimension) =>
              row(
                dimension,
                <>
                  {isMath && (
                    <Badge variant="light" flex="none">
                      {TIER_LABELS[dimension.tier]}
                    </Badge>
                  )}
                  <Tooltip label="Remove from this metric">
                    <ActionIcon
                      variant="subtle"
                      c="text-secondary"
                      aria-label={`Remove ${dimension.label}`}
                      onClick={() =>
                        onChange(unmapDimension(mapping, dimension))
                      }
                    >
                      <Icon name="close" />
                    </ActionIcon>
                  </Tooltip>
                </>,
              ),
            )}
            {mapped.length === 0 && (
              <Text px="md" py="sm" c="text-secondary">
                Nothing yet: the measures have no column in common.
              </Text>
            )}
          </Section>

          {suggested.length > 0 && (
            <Section title="Suggested" count={suggested.length}>
              {suggested.map((dimension) =>
                row(
                  dimension,
                  <>
                    <Text fz="sm" c="text-secondary">
                      {dimension.tier === "semantic"
                        ? "Different columns, same kind"
                        : "Removed"}
                    </Text>
                    <Button
                      size="compact-sm"
                      onClick={() => onChange(mapDimension(mapping, dimension))}
                    >
                      {dimension.tier === "semantic" ? "Map" : "Add back"}
                    </Button>
                  </>,
                ),
              )}
            </Section>
          )}

          {unshared.length > 0 && (
            <Section title="Only on some measures" count={unshared.length}>
              {unshared.map(({ dimension, pills: owners }) =>
                row(
                  dimension,
                  <Text fz="sm" c="text-secondary">
                    Filter {owners.join(" or ")} in the definition
                  </Text>,
                ),
              )}
            </Section>
          )}
        </Box>
      </Stack>
    </Card>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Box mt="md">
      <Group px="md" py="xs" gap="xs">
        <Text fw={700}>{title}</Text>
        <Text c="text-secondary">{count}</Text>
      </Group>
      {children}
    </Box>
  );
}

function Row({
  columns,
  isHeader = false,
  children,
}: {
  columns: string;
  isHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      display="grid"
      px="md"
      py={isHeader ? "xs" : "sm"}
      style={{
        gridTemplateColumns: columns,
        columnGap: "1rem",
        alignItems: "center",
        borderBottom: "1px solid var(--mb-color-border-neutral)",
      }}
    >
      {children}
    </Box>
  );
}

function Cell({
  justify = "flex-start",
  children,
}: {
  justify?: "flex-start" | "flex-end";
  children?: ReactNode;
}) {
  return (
    <Box
      display="flex"
      miw={0}
      style={{ alignItems: "center", gap: "0.5rem", justifyContent: justify }}
    >
      {children}
    </Box>
  );
}
