// Deliberate import-time side effect: xyflow's stylesheet must load with this
// chunk, otherwise the canvas renders unstyled.
import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";

import { DND_IGNORE_CLASS_NAME } from "metabase/common/components/dnd";
import { Loader, useColorScheme } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatabaseId } from "metabase-types/api";

import { useRunVisualization } from "../Notebook/use-run-visualization";

import S from "./NodeBuilder.module.css";
import { Fireworks } from "./components/Fireworks";
import { LoadMbqlModal } from "./components/LoadMbqlModal";
import { NodeDock } from "./components/NodeDock";
import { Toolbar } from "./components/Toolbar";
import { WireEdge } from "./components/WireEdge";
import { NodeBuilderContext, type NodeBuilderContextType } from "./context";
import {
  TAIL_KINDS,
  type TailKind,
  decorateEdge,
  graphKey,
  isNodeCollapsed,
  isTableNode,
  ladderStages,
  layoutNodes,
  lockTailWires,
  seedGraph,
  tailLadder,
} from "./graph";
import { useBlockEditing } from "./hooks/use-block-editing";
import { useCanvasEditing } from "./hooks/use-canvas-editing";
import { useCompiledGraph } from "./hooks/use-compiled-graph";
import { useScheduledFitView } from "./hooks/use-fit-view";
import { useHistory } from "./hooks/use-history";
import { useLoadMbql } from "./hooks/use-load-mbql";
import { useNodeDrop } from "./hooks/use-node-drop";
import { useQuestionSync } from "./hooks/use-question-sync";
import { useSources } from "./hooks/use-sources";
import { useStartupLayout } from "./hooks/use-startup-layout";
import { ExpressionNode } from "./nodes/ExpressionNode";
import { FilterNode } from "./nodes/FilterNode";
import { JoinNode } from "./nodes/JoinNode";
import { LimitNode } from "./nodes/LimitNode";
import { ResultNode } from "./nodes/ResultNode";
import { SortNode } from "./nodes/SortNode";
import { SummarizeNode } from "./nodes/SummarizeNode";
import { TableNode } from "./nodes/TableNode";
import type { BuilderEdge, BuilderNode } from "./types";

const NODE_TYPES = {
  table: TableNode,
  join: JoinNode,
  result: ResultNode,
  filter: FilterNode,
  expression: ExpressionNode,
  summarize: SummarizeNode,
  sort: SortNode,
  limit: LimitNode,
};

const EDGE_TYPES = { wire: WireEdge };

const PRO_OPTIONS = { hideAttribution: true };
const CONNECTION_LINE_STYLE = { strokeWidth: 2.5, strokeDasharray: "6 4" };
const DELETE_KEYS = ["Backspace", "Delete"];
// Sweep duration plus the trailing band's delay, see nodes.module.css.
const SHINE_DURATION_MS = 1100;
// The shine runs on every click; the fireworks stay rare.
const FIREWORKS_COOLDOWN_MS = 20_000;

export type NodeBuilderProps = {
  question: Question;
  isDirty: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  readOnly?: boolean;
  // A metric is one aggregation on one stage; the canvas keeps it that way.
  isMetric?: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery?: () => Promise<void>;
  setQueryBuilderMode?: (mode: string) => void;
};

export function NodeBuilder(props: NodeBuilderProps) {
  return (
    <ReactFlowProvider>
      <NodeBuilderCanvas {...props} />
    </ReactFlowProvider>
  );
}

// The canvas is seeded from the question once; from then on the canvas is
// the source of truth and the question follows it.
function NodeBuilderCanvas({
  question,
  isDirty,
  isRunnable,
  isResultDirty,
  readOnly = false,
  isMetric = false,
  updateQuestion,
  runQuestionQuery,
  setQueryBuilderMode,
}: NodeBuilderProps) {
  const { colorScheme } = useColorScheme();
  const { sources, databases, isLoading: isLoadingSources } = useSources();

  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<BuilderEdge>([]);
  const nodesRef = useLatest(nodes);
  const edgesRef = useLatest(edges);

  const scheduleFitView = useScheduledFitView();
  const { compiled, structureKey, compiledKeyRef } = useCompiledGraph(
    nodes,
    edges,
  );
  const { isSettled, canvasRef, beginSettling } = useStartupLayout({
    nodes,
    edgesRef,
    setNodes,
    compiled,
    compiledKeyRef,
  });
  const { markSynced } = useQuestionSync({
    compiled,
    question,
    updateQuestion,
    isEnabled: !readOnly,
  });
  const history = useHistory({
    nodes,
    edges,
    structureKey,
    setNodes,
    setEdges,
    isEnabled: !readOnly,
  });

  const seedFrom = useCallback(
    (query: Lib.Query) => {
      const seed = seedGraph(query);
      const seedNodes = layoutNodes(seed.nodes, seed.edges);
      const seedEdges = lockTailWires(seed.edges, seed.nodes);
      setNodes(seedNodes);
      setEdges(seedEdges);
      beginSettling(graphKey(seedNodes, seedEdges));
      scheduleFitView(true);
    },
    [setNodes, setEdges, beginSettling, scheduleFitView],
  );

  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      seedFrom(question.query());
    }
  }, [question, seedFrom]);

  // Replaces the canvas with the given query and pushes it to the question.
  const reseedFrom = useCallback(
    (query: Lib.Query) => {
      seedFrom(query);
      markSynced(query);
      updateQuestion(question.setQuery(query));
    },
    [seedFrom, markSynced, updateQuestion, question],
  );

  const blocks = useBlockEditing({ nodesRef, setNodes });
  const canvas = useCanvasEditing({
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    readOnly,
    scheduleFitView,
  });
  const drop = useNodeDrop({
    nodes,
    setNodes,
    addTailBlock: canvas.addTailBlock,
  });
  const loadMbql = useLoadMbql({ question, onLoaded: reseedFrom });
  const [isLoadMbqlOpen, setIsLoadMbqlOpen] = useState(false);

  const { visualizeQuestion } = useRunVisualization({
    question,
    isDirty,
    isResultDirty,
    updateQuestion,
    runQuestionQuery: runQuestionQuery ?? (() => Promise.resolve()),
    setQueryBuilderMode,
  });
  const visualizeRef = useLatest(visualizeQuestion);
  const handleVisualize = useCallback(
    () => visualizeRef.current(),
    [visualizeRef],
  );

  const [isShining, setIsShining] = useState(false);
  const [fireworksKey, setFireworksKey] = useState(0);
  const lastFireworksAtRef = useRef(0);
  const handleVibes = useCallback(() => {
    setIsShining(true);
    window.setTimeout(() => setIsShining(false), SHINE_DURATION_MS);
    const now = Date.now();
    if (now - lastFireworksAtRef.current >= FIREWORKS_COOLDOWN_MS) {
      lastFireworksAtRef.current = now;
      setFireworksKey((key) => key + 1);
    }
    setNodes((prevNodes) => layoutNodes(prevNodes, edgesRef.current));
    scheduleFitView();
  }, [edgesRef, setNodes, scheduleFitView]);

  const styledEdges = useMemo(
    () => edges.map((edge) => decorateEdge(edge, compiled)),
    [edges, compiled],
  );

  // Once any table is on the canvas, every other one has to come from the
  // same database.
  const sourceDatabaseId = useMemo<DatabaseId | null>(() => {
    if (compiled.query) {
      return Lib.databaseID(compiled.query);
    }
    const configured = nodes.find(
      (node) => isTableNode(node) && node.data.databaseId != null,
    );
    return configured && isTableNode(configured)
      ? configured.data.databaseId
      : null;
  }, [compiled.query, nodes]);

  const areAllCollapsed = nodes.every(isNodeCollapsed);

  // The dock adds to the last stage of the ladder; a kind already there is out.
  const presentTailKinds = useMemo<TailKind[]>(() => {
    const stages = ladderStages(tailLadder(nodes, edges));
    const last = stages[stages.length - 1] ?? [];
    return TAIL_KINDS.filter((kind) => last.some((node) => node.type === kind));
  }, [nodes, edges]);

  const contextValue = useMemo<NodeBuilderContextType>(
    () => ({
      compiled,
      readOnly,
      isMetric,
      isRunnable,
      isShining,
      sources,
      databases,
      isLoadingSources,
      sourceDatabaseId,
      onVisualize: handleVisualize,
      onPickTable: blocks.pickSource,
      onToggleColumn: blocks.toggleColumn,
      onStrategyChange: blocks.changeStrategy,
      onConditionsChange: blocks.changeConditions,
      onRemoveNode: canvas.removeNode,
      onAddStageBlock: canvas.addStageBlock,
      onToggleCollapsed: blocks.toggleCollapsed,
      onLimitChange: blocks.changeLimit,
      onOrderBysChange: blocks.changeOrderBys,
      onFiltersChange: blocks.changeFilters,
      onExpressionsChange: blocks.changeExpressions,
      onSummarizeChange: blocks.changeSummarize,
    }),
    [
      compiled,
      readOnly,
      isMetric,
      isRunnable,
      isShining,
      sources,
      databases,
      isLoadingSources,
      sourceDatabaseId,
      handleVisualize,
      blocks,
      canvas,
    ],
  );

  return (
    <NodeBuilderContext.Provider value={contextValue}>
      {/* Metabase's react-dnd backend cancels native drags it does not own;
          this class tells it to leave the builder's drag-and-drop alone. */}
      <div
        className={cx(S.root, DND_IGNORE_CLASS_NAME)}
        data-testid="node-builder"
      >
        <div
          ref={canvasRef}
          className={cx(S.canvas, { [S.settling]: !isSettled })}
          onDragOver={drop.onDragOver}
          onDrop={drop.onDrop}
        >
          {!isSettled && (
            <div className={S.settleOverlay} data-testid="node-builder-loader">
              <Loader size="lg" />
            </div>
          )}
          <ReactFlow
            className={S.flow}
            nodes={nodes}
            edges={styledEdges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            proOptions={PRO_OPTIONS}
            colorMode={colorScheme === "dark" ? "dark" : "light"}
            minZoom={0.2}
            maxZoom={1.5}
            nodesConnectable={!readOnly}
            edgesReconnectable={!readOnly}
            connectionLineStyle={CONNECTION_LINE_STYLE}
            isValidConnection={canvas.isValidConnection}
            deleteKeyCode={readOnly ? null : DELETE_KEYS}
            onBeforeDelete={canvas.beforeDelete}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={canvas.connect}
            onReconnect={canvas.reconnect}
            onNodeDragStart={history.recordDragStart}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
            <Controls showInteractive={false} position="bottom-left" />
            <Panel position="bottom-right">
              <Toolbar
                readOnly={readOnly}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                areAllCollapsed={areAllCollapsed}
                onUndo={history.undo}
                onRedo={history.redo}
                onLoadMbql={() => setIsLoadMbqlOpen(true)}
                onToggleCollapseAll={() =>
                  blocks.setAllCollapsed(!areAllCollapsed)
                }
                onVibes={handleVibes}
              />
            </Panel>
            {!readOnly && (
              <Panel position="top-center" className={S.dockPanel}>
                <NodeDock disabledTypes={presentTailKinds} />
              </Panel>
            )}
          </ReactFlow>
          <Fireworks burstKey={fireworksKey} />
        </div>
        <LoadMbqlModal
          opened={isLoadMbqlOpen}
          onClose={() => setIsLoadMbqlOpen(false)}
          onSubmit={loadMbql}
        />
      </div>
    </NodeBuilderContext.Provider>
  );
}
