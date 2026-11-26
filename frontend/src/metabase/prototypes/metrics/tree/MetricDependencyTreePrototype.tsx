import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  Background,
  type Edge,
  type EdgeProps,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  getSmoothStepPath,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import cx from "classnames";
import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import {
  ActionIcon,
  Box,
  Button,
  Card,
  Center,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Title,
  UnstyledButton,
  useColorScheme,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { formatNumber, getMeasure } from "../data";
import {
  MEASURE_TABLES,
  type MetricExample,
  exampleDraft,
} from "../explorer/examples";
import { evaluate } from "../explorer/formula";

import { MetricDependenciesPage } from "./MetricDependenciesPage";
import S from "./MetricDependencyTree.module.css";

/* ---------- the editor's examples as rows and the columns they use ---------- */

const ROW_HEIGHT_PX = 48;

type ColumnType = "number" | "date" | "boolean" | "string";

const COLUMN_TYPES: Record<ColumnType, { icon: IconName; dbType: string }> = {
  number: { icon: "int", dbType: "double" },
  date: { icon: "calendar", dbType: "timestamp" },
  boolean: { icon: "io", dbType: "boolean" },
  string: { icon: "string", dbType: "varchar" },
};

type Column = { name: string; type: ColumnType };

/** The column each table uses for the metric's time dimension. */
const TIME_COLUMNS: Record<string, string> = {
  Orders: "Created At",
  People: "Created At",
  Accounts: "Created At",
  Invoices: "Date Received",
  Reviews: "Created At",
};

/** The column a filter reads, by the editor's filter label. */
const FILTER_COLUMNS: Record<string, Column> = {
  "Product category = Gizmo": { name: "Product → Category", type: "string" },
  "Product category = Widget": { name: "Product → Category", type: "string" },
  "Discount is not empty": { name: "Discount", type: "number" },
  "Quantity ≥ 5": { name: "Quantity", type: "number" },
  "Source = Affiliate": { name: "Source", type: "string" },
  "Source = Google": { name: "Source", type: "string" },
  "Trial converted = true": { name: "Trial Converted", type: "boolean" },
  "Active subscription = true": {
    name: "Active Subscription",
    type: "boolean",
  },
  "Plan = Business": { name: "Plan", type: "string" },
  "Plan = Premium": { name: "Plan", type: "string" },
  "Rating ≥ 4": { name: "Rating", type: "number" },
};

const measureNamed = (name: string) =>
  getMeasure(name.toLowerCase().replace(/ /g, "-"));

/** The column a measure aggregates: "Sum of Total" → Total. Count has none. */
const aggregatedColumn = (name: string) =>
  measureNamed(name).aggregation.match(/ of (.+)$/)?.[1];

type NodeKind = "metric" | "measure" | "table";

const KIND_ICONS: Record<NodeKind, IconName> = {
  metric: "metric",
  measure: "sum",
  table: "table",
};

const KIND_LABELS: Record<NodeKind, string> = {
  metric: "Metric",
  measure: "Measure",
  table: "Table",
};

type Row = {
  id: string;
  /** Small heading above the row when it starts a new group. */
  section: string;
  icon: IconName;
  /** Shown in a circle instead of the icon: the row's math operator. */
  op?: string;
  name: string;
  /** Right-aligned, like a column's database type. */
  detail: string;
  isResult?: boolean;
  /** Edges come in on the left of the row. */
  hasInput?: boolean;
  /** Edges leave from the right of the row. */
  hasOutput?: boolean;
  /** The card at the other end of the row's edge, for the info panel. */
  targetNodeId?: string;
};

type CardData = {
  kind: NodeKind;
  name: string;
  description: string;
  rows: Row[];
};

type CardNode = Node<CardData, "card">;

const columnRowId = (column: string) => `col:${column}`;

/**
 * Nodes and edges for a metric, flowing left to right like the schema
 * viewer's foreign keys: table columns feed each measure's rows, and each
 * measure feeds a row of the metric's formula, where the math happens.
 */
function buildGraph(example: MetricExample): {
  nodes: CardNode[];
  edges: Edge[];
} {
  const nodes = new Map<string, CardNode>();
  const edges = new Map<string, Edge>();
  const tableColumns = new Map<string, Map<string, Column>>();

  const addEdge = (
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string,
    op?: string,
  ) => {
    const id = `${source}:${sourceHandle}->${target}:${targetHandle}`;
    edges.set(id, {
      id,
      source,
      sourceHandle,
      target,
      targetHandle,
      type: "schemaViewerEdge",
      data: { op },
    });
  };

  const addColumn = (table: string, column: Column) => {
    const columns = tableColumns.get(table) ?? new Map<string, Column>();
    columns.set(column.name, column);
    tableColumns.set(table, columns);
    return columnRowId(column.name);
  };

  const metricId = `metric:${example.id}`;
  const formulaRows: Row[] = [];
  let pendingOp = "";

  example.formula.forEach((part, index) => {
    if (typeof part === "string" && !MEASURE_TABLES[part]) {
      pendingOp = part;
      return;
    }
    const measureName = typeof part === "string" ? part : part.measure;
    const filters = typeof part === "string" ? [] : part.filters;
    const allFilters = [...filters, ...example.where];
    const measure = measureNamed(measureName);
    const table = MEASURE_TABLES[measureName];
    const tableId = `table:${table}`;
    const measureId = `measure:${measureName}|${allFilters.join(",")}`;
    const value =
      (measure.series.at(-1) ?? 0) * Math.pow(0.7, allFilters.length);

    const column = aggregatedColumn(measureName);
    const measureRows: Row[] = [
      {
        id: "aggregation",
        section: "Calculates",
        icon: "sum",
        name: measure.aggregation,
        detail: column ? `${table}.${column}` : `rows in ${table}`,
        hasInput: true,
        targetNodeId: tableId,
      },
      ...allFilters.map(
        (filter): Row => ({
          id: `filter:${filter}`,
          section: "Only rows where",
          icon: "filter",
          name: filter,
          detail: example.where.includes(filter) ? "from the metric" : "",
          hasInput: true,
          targetNodeId: tableId,
        }),
      ),
      {
        id: "time",
        section: "Over time by",
        icon: "calendar",
        name: TIME_COLUMNS[table],
        detail: `${table}.${TIME_COLUMNS[table]}`,
        hasInput: true,
        targetNodeId: tableId,
      },
    ];
    addEdge(
      tableId,
      column ? addColumn(table, { name: column, type: "number" }) : "header",
      measureId,
      "aggregation",
    );
    allFilters.forEach((filter) =>
      addEdge(
        tableId,
        addColumn(table, FILTER_COLUMNS[filter]),
        measureId,
        `filter:${filter}`,
      ),
    );
    addEdge(
      tableId,
      addColumn(table, { name: TIME_COLUMNS[table], type: "date" }),
      measureId,
      "time",
    );

    nodes.set(measureId, {
      id: measureId,
      type: "card",
      position: { x: 0, y: 0 },
      data: {
        kind: "measure",
        name:
          filters.length > 0
            ? `${measureName} | ${filters.join(", ")}`
            : measureName,
        description: `${measure.aggregation} of rows in ${table}.`,
        rows: measureRows,
      },
    });

    formulaRows.push({
      id: `term:${index}`,
      section: "Formula",
      icon: "sum",
      op: pendingOp || undefined,
      name: nodes.get(measureId)?.data.name ?? measureName,
      detail: formatNumber(value),
      hasInput: true,
      targetNodeId: measureId,
    });
    addEdge(
      measureId,
      "header",
      metricId,
      `term:${index}`,
      pendingOp || undefined,
    );
  });

  const result = evaluate(
    exampleDraft(example, (name) => name.toLowerCase().replace(/ /g, "-")),
  );
  const metricRows: Row[] = [
    ...formulaRows,
    {
      id: "result",
      section: "Formula",
      icon: "metric",
      op: "=",
      name: example.name,
      detail: formatNumber(result?.at(-1) ?? 0),
      isResult: true,
    },
    ...example.where.map(
      (filter): Row => ({
        id: `where:${filter}`,
        section: "Only rows where",
        icon: "filter",
        name: filter,
        detail: "every measure",
      }),
    ),
    {
      id: "dimension",
      section: "Over time by",
      icon: "calendar",
      name: "Created At",
      detail: "each measure’s date",
    },
  ];

  nodes.set(metricId, {
    id: metricId,
    type: "card",
    position: { x: 0, y: 0 },
    data: {
      kind: "metric",
      name: example.name,
      description: example.hint,
      rows: metricRows,
    },
  });

  tableColumns.forEach((columns, table) => {
    const tableId = `table:${table}`;
    nodes.set(tableId, {
      id: tableId,
      type: "card",
      position: { x: 0, y: 0 },
      data: {
        kind: "table",
        name: table,
        description: `${table} table in the Sample Database.`,
        rows: [...columns.values()].map(
          (column): Row => ({
            id: columnRowId(column.name),
            section: "Columns used",
            icon: COLUMN_TYPES[column.type].icon,
            name: column.name,
            detail: COLUMN_TYPES[column.type].dbType,
            hasOutput: true,
          }),
        ),
      },
    });
  });

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** Dagre, left to right, on measured sizes: the schema viewer's layout. */
function layout(nodes: CardNode[], edges: Edge[]): CardNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 140 });
  graph.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((node) =>
    graph.setNode(node.id, {
      width: node.measured?.width,
      height: node.measured?.height,
    }),
  );
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  return nodes.map((node) => {
    const { x, y, width, height } = graph.node(node.id);
    return { ...node, position: { x: x - width / 2, y: y - height / 2 } };
  });
}

/* ---------- canvas ---------- */

type TreeContextValue = {
  selectedNodeId: string | null;
  selectNode: (id: string | null) => void;
  /** `nodeId:handleId` of rows at either end of the selected edge. */
  selectedRowKeys: Set<string>;
};

const TreeContext = createContext<TreeContextValue>({
  selectedNodeId: null,
  selectNode: () => {},
  selectedRowKeys: new Set(),
});

const NODE_TYPES = { card: TreeCard };
const EDGE_TYPES = { schemaViewerEdge: SchemaViewerStyleEdge };

/**
 * A metric tree in the schema viewer's look, on the metric's Dependencies
 * tab: the metric's terms point to its measures, and each measure's
 * aggregation, filters and time dimension point to the columns they read.
 */
export function MetricDependencyTreePrototype() {
  return (
    <MetricDependenciesPage>
      {(example) => <TreeCanvas key={example.id} example={example} />}
    </MetricDependenciesPage>
  );
}

function TreeCanvas({ example }: { example: MetricExample }) {
  const { colorScheme } = useColorScheme();
  const graph = useMemo(() => buildGraph(example), [example]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedRowKeys = useMemo(
    () =>
      new Set(
        edges
          .filter((edge) => edge.selected)
          .flatMap((edge) => [
            `${edge.source}:${edge.sourceHandle}`,
            `${edge.target}:${edge.targetHandle}`,
          ]),
      ),
    [edges],
  );

  const clearEdgeSelection = useCallback(
    () =>
      setEdges((current) =>
        current.map((edge) => ({ ...edge, selected: false })),
      ),
    [setEdges],
  );

  const selectNode = useCallback(
    (id: string | null) => {
      setSelectedNodeId(id);
      if (id != null) {
        clearEdgeSelection();
      }
    },
    [clearEdgeSelection],
  );

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  return (
    <TreeContext.Provider
      value={{ selectedNodeId, selectNode, selectedRowKeys }}
    >
      <ReactFlow
        className={S.reactFlow}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={clearEdgeSelection}
        proOptions={{ hideAttribution: true }}
        colorMode={colorScheme === "dark" ? "dark" : "light"}
        minZoom={0.3}
        maxZoom={1}
        fitView
        nodesConnectable={false}
      >
        <Background />
        <TreeMinimap />
        <AutoLayout setNodes={setNodes} />
        <Panel position="bottom-left">
          <AutoLayoutButton setNodes={setNodes} />
        </Panel>
        {selectedNode && (
          <Panel className={S.infoPanel} position="top-right">
            <InfoPanel
              node={selectedNode}
              nodes={nodes}
              onClose={() => setSelectedNodeId(null)}
            />
          </Panel>
        )}
      </ReactFlow>
    </TreeContext.Provider>
  );
}

/** Lays the nodes out once React Flow has measured them. */
function AutoLayout({ setNodes }: { setNodes: (nodes: CardNode[]) => void }) {
  const { getNodes, getEdges, fitView } = useReactFlow<CardNode>();
  const isInitialized = useNodesInitialized();

  useLayoutEffect(() => {
    if (isInitialized) {
      const next = layout(getNodes(), getEdges());
      setNodes(next);
      fitView({ nodes: next, padding: 0.15 });
    }
  }, [isInitialized, getNodes, getEdges, setNodes, fitView]);

  return null;
}

function AutoLayoutButton({
  setNodes,
}: {
  setNodes: (nodes: CardNode[]) => void;
}) {
  const { getNodes, getEdges, fitView } = useReactFlow<CardNode>();
  const handleClick = () => {
    const next = layout(getNodes(), getEdges());
    setNodes(next);
    fitView({ nodes: next, padding: 0.15, duration: 300 });
  };
  return (
    <Button
      bg="background_page-primary"
      leftSection={<FixedSizeIcon name="sparkles" />}
      onClick={handleClick}
    >
      Auto-layout
    </Button>
  );
}

/** The schema viewer's minimap: shaded by how connected each node is. */
function TreeMinimap() {
  const { colorScheme } = useColorScheme();
  const { getEdges } = useReactFlow();
  const isDark = colorScheme === "dark";

  const nodeColor = (node: { id: string }) => {
    const counts = new Map<string, number>();
    getEdges().forEach((edge) => {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
    });
    const max = Math.max(0, ...counts.values());
    const ratio = max > 0 ? (counts.get(node.id) ?? 0) / max : 0;
    const leaf = isDark ? 28 : 88;
    const hub = isDark ? 80 : 32;
    return `hsl(0, 0%, ${leaf + ratio * (hub - leaf)}%)`;
  };

  return (
    <MiniMap
      position="bottom-right"
      pannable
      zoomable={false}
      nodeColor={nodeColor}
      bgColor={
        isDark
          ? "var(--mb-color-background_page-secondary)"
          : "var(--mb-color-background_surface-primary)"
      }
      maskStrokeColor="var(--mb-color-border-neutral)"
    />
  );
}

/* ---------- cards: the schema viewer's table node ---------- */

function TreeCard({ id, data }: NodeProps<CardNode>) {
  const { selectedNodeId, selectNode, selectedRowKeys } =
    useContext(TreeContext);
  const { fitView } = useReactFlow();
  const isConnectedToSelectedEdge = data.rows.some((row) =>
    selectedRowKeys.has(`${id}:${row.id}`),
  );

  return (
    <Stack
      className={cx(S.card, {
        [S.selected]: isConnectedToSelectedEdge || selectedNodeId === id,
      })}
      gap={0}
      onDoubleClick={() =>
        fitView({ nodes: [{ id }], duration: 300, maxZoom: 1 })
      }
    >
      <Group
        className={S.header}
        gap="sm"
        px="lg"
        py="lg"
        wrap="nowrap"
        onClick={(event) => {
          event.stopPropagation();
          selectNode(id);
        }}
        style={{ cursor: "pointer" }}
      >
        <FixedSizeIcon name={KIND_ICONS[data.kind]} c="text-secondary" />
        <Box
          fz={17}
          lh="1.5rem"
          fw={700}
          c="text-primary"
          className={S.truncate}
        >
          {data.name}
        </Box>
        {data.kind !== "metric" && (
          <Handle
            type="source"
            position={Position.Right}
            id="header"
            className={S.handle}
          />
        )}
      </Group>
      <Box>
        {data.rows.map((row, index) => {
          const isSelectedInEdge = selectedRowKeys.has(`${id}:${row.id}`);
          const startsSection =
            index === 0 || data.rows[index - 1].section !== row.section;
          return (
            <Fragment key={row.id}>
              {startsSection && (
                <Box className={S.section} px="lg" py="xs" fz="xs" fw="bold">
                  {row.section}
                </Box>
              )}
              <Group
                className={cx(S.row, { [S.result]: row.isResult })}
                gap="sm"
                wrap="nowrap"
                h={ROW_HEIGHT_PX}
                px="lg"
              >
                {row.op != null ? (
                  <Center className={S.op}>{row.op}</Center>
                ) : (
                  <FixedSizeIcon
                    name={row.icon}
                    size={16}
                    c={isSelectedInEdge ? "core-brand" : "text-secondary"}
                    style={{ flexShrink: 0 }}
                  />
                )}
                <Box
                  className={S.truncate}
                  fz="sm"
                  fw={isSelectedInEdge || row.isResult ? "bold" : "normal"}
                  c={isSelectedInEdge ? "core-brand" : undefined}
                >
                  {row.name}
                </Box>
                <Box
                  fz="sm"
                  c={row.isResult ? "text-primary" : "text-secondary"}
                  fw={row.isResult ? "bold" : "normal"}
                  style={{ flexShrink: 0 }}
                >
                  {row.detail}
                </Box>
                {row.hasInput && (
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={row.id}
                    className={S.handle}
                  />
                )}
                {row.hasOutput && (
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={row.id}
                    className={S.handle}
                  />
                )}
              </Group>
            </Fragment>
          );
        })}
      </Box>
    </Stack>
  );
}

/* ---------- edges: the schema viewer's dashed step edge ---------- */

const SYMBOL_GAP = 4;
const SYMBOL_W = 8;
const SYMBOL_H = 6;
const OP_RADIUS = 12;
const OP_OFFSET = 40;

function SchemaViewerStyleEdge(props: EdgeProps) {
  const isInitialized = useNodesInitialized();
  const selected = props.selected ?? false;
  const stroke = selected
    ? "var(--mb-color-core-brand)"
    : "var(--mb-color-border-neutral-strong)";
  const strokeWidth = selected ? 2 : 1;
  const [path] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  // Crow's foot at the source (many), a bar at the target (one).
  const sourceAnchor = props.sourceX + SYMBOL_GAP;
  const sourceBack = props.sourceX + SYMBOL_GAP + SYMBOL_W;
  const targetAnchor = props.targetX - SYMBOL_GAP;
  const op = typeof props.data?.op === "string" ? props.data.op : null;

  return (
    <g style={{ visibility: isInitialized ? undefined : "hidden" }}>
      <path d={path} fill="none" stroke="transparent" strokeWidth={20} />
      <path
        d={path}
        fill="none"
        style={{ stroke, strokeWidth, strokeDasharray: "9 9" }}
      />
      <line
        x1={sourceBack}
        y1={props.sourceY}
        x2={sourceAnchor}
        y2={props.sourceY - SYMBOL_H}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <line
        x1={sourceBack}
        y1={props.sourceY}
        x2={sourceAnchor}
        y2={props.sourceY + SYMBOL_H}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <line
        x1={targetAnchor}
        y1={props.targetY - SYMBOL_H}
        x2={targetAnchor}
        y2={props.targetY + SYMBOL_H}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {op != null && (
        <g
          transform={`translate(${props.targetX - OP_OFFSET}, ${props.targetY})`}
        >
          <circle
            r={OP_RADIUS}
            fill="var(--mb-color-background_page-primary)"
            stroke="var(--mb-color-core-brand)"
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={16}
            fontWeight={700}
            fill="var(--mb-color-core-brand)"
          >
            {op}
          </text>
        </g>
      )}
    </g>
  );
}

/* ---------- info panel: the schema viewer's selected node panel ---------- */

function InfoPanel({
  node,
  nodes,
  onClose,
}: {
  node: CardNode;
  nodes: CardNode[];
  onClose: () => void;
}) {
  const { fitView } = useReactFlow();
  const { selectNode } = useContext(TreeContext);
  const zoomTo = (id: string) => {
    selectNode(id);
    fitView({ nodes: [{ id }], duration: 300, maxZoom: 1 });
  };
  const nameOf = (id: string) =>
    nodes.find((candidate) => candidate.id === id)?.data.name ?? id;
  const breadcrumbs =
    node.data.kind === "table"
      ? ["Sample Database", "PUBLIC"]
      : ["Our analytics", KIND_LABELS[node.data.kind]];

  return (
    <Card className={S.panelCard} withBorder>
      <Group className={S.panelHeader} p="xl" gap="0.75rem" wrap="nowrap">
        <Center
          w="2.75rem"
          h="2.75rem"
          bdrs="50%"
          bg="background_page-secondary"
        >
          <FixedSizeIcon
            name={KIND_ICONS[node.data.kind]}
            c="core-brand"
            size={20}
          />
        </Center>
        <Stack gap="xxs" flex={1} miw={0}>
          <UnstyledButton
            className={S.titleButton}
            onClick={() => zoomTo(node.id)}
          >
            <Title order={3} lh="1.5rem">
              {node.data.name}
            </Title>
          </UnstyledButton>
          <Text fz="sm" c="text-secondary" lh="1rem">
            {breadcrumbs.join(" / ")}
          </Text>
        </Stack>
        <Group m="-sm" gap="xxs" wrap="nowrap">
          <ActionIcon variant="subtle" aria-label="Open">
            <FixedSizeIcon name="external" />
          </ActionIcon>
          <ActionIcon variant="subtle" aria-label="Close" onClick={onClose}>
            <FixedSizeIcon name="close" />
          </ActionIcon>
        </Group>
      </Group>
      <Stack className={S.panelBody} p="xl" gap="xl">
        <Box c="text-primary" lh="h4">
          {node.data.description}
        </Box>
        <Stack gap="xxs" lh="1rem">
          <Title order={6}>Owner</Title>
          <Text lh="h4">Alex Doe</Text>
        </Stack>
        <Stack gap="lg" lh="1rem">
          <Title order={6}>
            {node.data.rows.length}{" "}
            {node.data.kind === "table" ? "fields used" : "parts"}
          </Title>
          {node.data.rows.map((row) => (
            <PanelRow
              key={row.id}
              row={row}
              targetName={
                row.targetNodeId != null ? nameOf(row.targetNodeId) : null
              }
              onZoomTo={zoomTo}
            />
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function PanelRow({
  row,
  targetName,
  onZoomTo,
}: {
  row: Row;
  targetName: string | null;
  onZoomTo: (id: string) => void;
}) {
  const { targetNodeId } = row;
  return (
    <Group gap="sm" wrap="nowrap">
      <FixedSizeIcon name={row.icon} c="text-secondary" />
      <Text className={S.truncate} lh="1rem">
        {row.name}
      </Text>
      {targetNodeId != null && targetName != null && (
        <Group gap="xxs" wrap="nowrap" miw={0} maw="50%">
          <Text c="text-secondary" lh={1} fz="1rem">
            →
          </Text>
          <UnstyledButton
            className={S.link}
            c="core-brand"
            onClick={() => onZoomTo(targetNodeId)}
          >
            <Group gap={4} wrap="nowrap">
              <FixedSizeIcon
                name={targetNodeId.startsWith("table:") ? "table" : "sum"}
                size={14}
              />
              <Text c="inherit" lh="1rem" className={S.truncate}>
                {targetName}
              </Text>
            </Group>
          </UnstyledButton>
        </Group>
      )}
    </Group>
  );
}
