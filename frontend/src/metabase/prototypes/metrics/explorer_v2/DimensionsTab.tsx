import type { ReactNode } from "react";

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import {
  type MetricDimension,
  type Origin,
  type PanelMapping,
  type PanelModel,
  mapDimension,
  removeDimension,
} from "./panelModel";

const ORIGIN_LABELS: Record<Origin, string> = {
  time: "Each measure’s date",
  field: "Same field",
  custom: "Made by you",
};

/**
 * Prototype: every dimension of the metric with the field each measure reads
 * for it, side by side. The panel next to the chart edits the same thing.
 */
export function DimensionsTab({
  model,
  mapping,
  onChange,
}: {
  model: PanelModel;
  mapping: PanelMapping;
  onChange: (mapping: PanelMapping) => void;
}) {
  const { pills, mapped, removed, incomplete } = model;
  if (pills.length === 0) {
    return (
      <Text p="xl" c="text-secondary">
        Add a measure to the definition to see its dimensions.
      </Text>
    );
  }
  if (model.isLoading) {
    return (
      <Group p="xl" justify="center">
        <Loader />
      </Group>
    );
  }
  const isMath = pills.length > 1;
  const columns = `minmax(12rem, 1.2fr) repeat(${pills.length}, minmax(11rem, 1fr)) minmax(14rem, auto)`;
  // Fields no dimension reads, listed or not: only one measure has them.
  const listed = [...mapped, ...removed, ...incomplete];
  const unusedCount = pills.reduce(
    (count, pill) =>
      count +
      pill.dimensions.filter(
        (field) =>
          !listed.some((dimension) => dimension.picks[pill.id] === field),
      ).length,
    0,
  );

  const row = (dimension: MetricDimension, action: ReactNode) => (
    <Row key={dimension.id} columns={columns}>
      <Cell>
        <Icon name={dimension.icon} c="text-secondary" />
        <Text fw={700} truncate>
          {dimension.name}
        </Text>
      </Cell>
      {pills.map((pill) => (
        <Cell key={pill.id}>
          <Text c="text-secondary" truncate>
            {dimension.picks[pill.id]?.name ?? "—"}
          </Text>
        </Cell>
      ))}
      <Cell justify="flex-end">{action}</Cell>
    </Row>
  );

  const addBack = (dimension: MetricDimension, label: string) => (
    <Button
      size="compact-sm"
      onClick={() => onChange(mapDimension(mapping, dimension))}
    >
      {label}
    </Button>
  );

  return (
    <Card withBorder shadow="none" p="lg">
      <Stack gap="lg">
        <Text c="text-secondary" maw="44rem">
          {isMath
            ? "A dimension is something the whole metric can be filtered and broken out by, so it needs a field in every measure. Change which field a measure reads in the panel next to the chart."
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
                      {ORIGIN_LABELS[dimension.origin]}
                    </Badge>
                  )}
                  <Tooltip label="Remove from this metric">
                    <ActionIcon
                      variant="subtle"
                      c="text-secondary"
                      aria-label={`Remove ${dimension.name}`}
                      onClick={() =>
                        onChange(removeDimension(mapping, dimension))
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
                Nothing yet: the measures have no field in common.
              </Text>
            )}
          </Section>

          {incomplete.length > 0 && (
            <Section title="Incomplete" count={incomplete.length}>
              {incomplete.map((dimension) =>
                row(
                  dimension,
                  <Text fz="sm" c="text-secondary">
                    {`No field in ${dimension.missing.join(" or ")}`}
                  </Text>,
                ),
              )}
            </Section>
          )}

          {removed.length > 0 && (
            <Section title="Removed" count={removed.length}>
              {removed.map((dimension) =>
                row(dimension, addBack(dimension, "Add back")),
              )}
            </Section>
          )}
        </Box>
        {isMath && unusedCount > 0 && (
          <Text c="text-secondary">
            {`${unusedCount} more fields are in none of the metric’s dimensions. They can still filter the measure they are on; “See all” in the panel lists them.`}
          </Text>
        )}
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
