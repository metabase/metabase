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

const joinId = ({ from, to }: TableLink) => `join_${from}_${to}`;

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
  // Tables no measure is on, reached through a key: dimensions come from them.
  const lookupLinks = links.filter(({ to }) => !tables.includes(to));
  const lookupTables = [...new Set(lookupLinks.map(({ to }) => to))];
  // A table with no join would sit a column left of the joined ones: an
  // invisible line from that column keeps the measures' tables lined up.
  const leftmost = [
    ...lookupTables.map(tableId),
    ...directLinks.map(joinId),
  ].at(0);
  const unjoinedTables = tables.filter(
    (table) => !links.some(({ from, to }) => from === table || to === table),
  );

  return [
    "flowchart LR",
    ...lookupTables.map(
      (table) => `${tableId(table)}[(${quote(table)})]:::lookup`,
    ),
    ...tables.map((table) => `${tableId(table)}[(${quote(table)})]:::table`),
    ...lookupLinks.map(
      ({ from, to, key }) =>
        `${tableId(to)} ---|${quote(key)}| ${tableId(from)}`,
    ),
    ...directLinks.flatMap((link) => [
      `${joinId(link)}(${quote(`${link.from}.${link.key} → ${link.to}`)}):::join --- ${tableId(link.from)}`,
      `${joinId(link)} --- ${tableId(link.to)}`,
    ]),
    ...(leftmost === undefined
      ? []
      : unjoinedTables.map((table) => `${leftmost} ~~~ ${tableId(table)}`)),
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
    <Stack gap="md" w="100%">
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
