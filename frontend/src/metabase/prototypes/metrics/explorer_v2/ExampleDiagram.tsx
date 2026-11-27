import { render as renderDiagram } from "pele";
import { useMemo } from "react";

import { Box, Stack, Text } from "metabase/ui";

import S from "./ExampleDiagram.module.css";
import { COLUMNS, MEASURE_TABLES, SEGMENTS, segmentNameOf } from "./catalog";
import { dimensionLabelOf } from "./dimensions";
import { EXAMPLES, type MetricExample } from "./examples";

const FONT_SIZE = 13;

type TableLink = { from: string; to: string; key: string };

/** The foreign keys the catalog's columns are reached through. */
const TABLE_LINKS = COLUMNS.reduce<TableLink[]>((links, column) => {
  if (column.via == null) {
    return links;
  }
  const to = column.field.slice(0, column.field.indexOf("."));
  const isKnown = links.some(
    (link) => link.from === column.table && link.to === to,
  );
  return isKnown
    ? links
    : [...links, { from: column.table, to, key: `${column.via} ID` }];
}, []);

type Graph = { lines: string[]; tables: string[] };

const quote = (label: string) => `"${label.replace(/"/g, "#quot;")}"`;

const tableId = (table: string) => `table_${table}`;

type FilterTarget = {
  /** The node the filters point at. */
  target: string;
  /** The tables that node reads. */
  tables: string[];
};

/** The columns a filter reads on these tables, like "People.Source". */
const filterFields = ({
  filter,
  tables,
}: {
  filter: string;
  tables: string[];
}) => {
  const label = dimensionLabelOf(filter);
  return [
    ...new Set(
      COLUMNS.filter(
        (column) => column.label === label && tables.includes(column.table),
      ).map((column) => column.field),
    ),
  ];
};

/** What the pill shows, then the columns behind it. A segment is spelled out. */
const filterNodeLabel = ({
  filter,
  tables,
}: {
  filter: string;
  tables: string[];
}) => {
  const segment = SEGMENTS.find(({ name }) => name === segmentNameOf(filter));
  if (segment == null) {
    return [filter, ...filterFields({ filter, tables })].join("<br/>");
  }
  const label = dimensionLabelOf(segment.filter);
  const field = filterFields({
    filter: segment.filter,
    tables: [segment.table],
  }).at(0);
  const definition =
    label != null && field !== undefined
      ? segment.filter.replace(label, field)
      : segment.filter;
  return `${segment.name}<br/>${definition}`;
};

const filterLines = ({
  filters,
  target,
  tables,
}: FilterTarget & { filters: string[] }) =>
  filters.map(
    (filter, index) =>
      `${target}_filter${index}{{${quote(filterNodeLabel({ filter, tables }))}}}:::filter -.-> ${target}`,
  );

/** The metric as a node, with what feeds it: measures, or metrics used as pills. */
function metricGraph({
  example,
  id,
}: {
  example: MetricExample;
  id: string;
}): Graph {
  const measureGraph = ({
    measure,
    filters,
    pillId,
  }: {
    measure: string;
    filters: string[];
    pillId: string;
  }): Graph => ({
    lines: [
      `${tableId(MEASURE_TABLES[measure])} --> ${pillId}[${quote(measure)}]:::measure`,
      `${pillId} --> ${id}`,
      ...filterLines({
        filters,
        target: pillId,
        tables: [MEASURE_TABLES[measure]],
      }),
    ],
    tables: [MEASURE_TABLES[measure]],
  });

  const pills = example.formula.flatMap((part, index): Graph[] => {
    const pillId = `${id}_${index}`;
    if (typeof part === "string") {
      return part in MEASURE_TABLES
        ? [measureGraph({ measure: part, filters: [], pillId })]
        : [];
    }
    if ("measure" in part) {
      return [measureGraph({ ...part, pillId })];
    }
    const inner = EXAMPLES.find((candidate) => candidate.id === part.metric);
    if (inner == null) {
      return [];
    }
    const innerGraph = metricGraph({ example: inner, id: pillId });
    return [
      {
        lines: [
          ...innerGraph.lines,
          `${pillId} --> ${id}`,
          ...filterLines({
            filters: part.filters,
            target: pillId,
            tables: innerGraph.tables,
          }),
        ],
        tables: innerGraph.tables,
      },
    ];
  });

  const tables = pills.flatMap((pill) => pill.tables);
  return {
    lines: [
      `${id}([${quote(example.name)}]):::metric`,
      ...pills.flatMap((pill) => pill.lines),
      ...filterLines({ filters: example.where, target: id, tables }),
    ],
    tables,
  };
}

/**
 * Mermaid for the example: tables, the measures on them, and the metric.
 * What joins two tables sits to their left on plain lines, so the tables line
 * up: an arrow between them would read as one measure depending on the other.
 */
function diagramSource(example: MetricExample): string {
  const graph = metricGraph({ example, id: "metric" });
  const tables = [...new Set(graph.tables)];
  const links = TABLE_LINKS.filter(({ from }) => tables.includes(from));
  const directLinks = links.filter(({ to }) => tables.includes(to));
  // A table none of the measures is on shows when two of them meet there.
  const sharedLinks = links.filter(
    ({ from, to }) =>
      !tables.includes(to) &&
      links.some((link) => link.from !== from && link.to === to),
  );
  const sharedTables = [...new Set(sharedLinks.map(({ to }) => to))];

  return [
    "flowchart LR",
    ...[...sharedTables, ...tables].map(
      (table) => `${tableId(table)}[(${quote(table)})]:::table`,
    ),
    ...sharedLinks.map(
      ({ from, to, key }) =>
        `${tableId(to)} ---|${quote(key)}| ${tableId(from)}`,
    ),
    ...directLinks.flatMap(({ from, to, key }) => [
      `join_${from}_${to}(${quote(`${from}.${key} → ${to}`)}):::join --- ${tableId(from)}`,
      `join_${from}_${to} --- ${tableId(to)}`,
    ]),
    ...graph.lines,
  ].join("\n");
}

/** How the loaded example's tables, measures and filters relate. */
export function ExampleDiagram({ example }: { example: MetricExample }) {
  const svg = useMemo(
    () =>
      renderDiagram(diagramSource(example), {
        fontFamily: "Lato, sans-serif",
        fontSize: FONT_SIZE,
      }).svg,
    [example],
  );

  return (
    <Stack gap="xs">
      <Text c="text-secondary">
        Tables feed measures, measures feed the metric. Plain lines are how the
        tables join, dashed arrows are filters.
      </Text>
      <Box
        className={S.diagram}
        // Built from our own catalog, not user input.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </Stack>
  );
}
