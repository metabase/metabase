import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import cx from "classnames";
import { type MouseEvent, useMemo, useState } from "react";
import { t } from "ttag";

import { useEditorHost } from "metabase/rich_text_editing/tiptap/EditorHost";
import { Alert, Box, Group, Stack, Text } from "metabase/ui";
import type { ProductAnalyticsNodeDefinition } from "metabase-types/api";
import { getProductAnalyticsNodeDefinition } from "metabase-types/guards";

import { AnalysisResult, getResultState } from "../components/AnalysisResult";

import { AnalysisCardMenu } from "./AnalysisCardMenu";
import { AnalysisCardToolbar } from "./AnalysisCardToolbar";
import { AnalysisChartModal } from "./AnalysisChartModal";
import { useAnalysisDocument } from "./AnalysisDocumentContext";
import S from "./AnalysisNode.module.css";
import { AnalysisResizeHandle } from "./AnalysisResizeHandle";
import { AnalysisTitleButton } from "./AnalysisTitleButton";
import { getAnalysisNodeId } from "./analysis-node-utils";
import { getDocumentDrillsMode } from "./drills";
import { ANALYSIS_CARD_ATTRIBUTE } from "./use-analysis-document-state";
import { useDocumentAnalysis } from "./use-document-analysis";

// Matches the old fixed layout: a 400px chart under the header.
const DEFAULT_CARD_HEIGHT = 510;
const MIN_CARD_HEIGHT = 280;
const CHART_SELECTOR = "[data-analysis-chart]";
const INTERACTIVE_SELECTOR = "button, a, input, textarea, [role='button']";

export const AnalysisNodeView = ({
  node,
  deleteNode,
  updateAttributes,
}: NodeViewProps) => {
  const nodeId = getAnalysisNodeId(node);
  const definition = getProductAnalyticsNodeDefinition(node.attrs.definition);

  if (nodeId === undefined || definition === undefined) {
    return (
      <NodeViewWrapper className={S.wrapper}>
        <Alert color="error">{t`This analysis can't be read.`}</Alert>
      </NodeViewWrapper>
    );
  }
  return (
    <AnalysisCard
      nodeId={nodeId}
      definition={definition}
      height={
        typeof node.attrs.height === "number"
          ? node.attrs.height
          : DEFAULT_CARD_HEIGHT
      }
      onHeightChange={(height) => updateAttributes({ height })}
      onRemove={deleteNode}
    />
  );
};

type AnalysisCardProps = {
  nodeId: string;
  definition: ProductAnalyticsNodeDefinition;
  height: number;
  onHeightChange: (height: number) => void;
  onRemove: () => void;
};

const AnalysisCard = ({
  nodeId,
  definition,
  height,
  onHeightChange,
  onRemove,
}: AnalysisCardProps) => {
  // Follows the drag live; the node only stores the height when it ends.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const getResizedHeight = (deltaY: number) =>
    Math.max(height + deltaY, MIN_CARD_HEIGHT);
  const analysisDocument = useAnalysisDocument();
  const host = useEditorHost();
  const { ref, shouldLoadData } = host.useNodeInViewport(nodeId);
  const analysis = useDocumentAnalysis({
    nodeId,
    definition,
    isEnabled: shouldLoadData,
  });
  const { config, computed, query } = analysis;
  host.useReportPrefetchLoading(nodeId, query.isLoading);
  const commentsPath = host.useCommentUrl({ childTargetId: nodeId });

  const isEditing = analysisDocument.editingNodeId === nodeId;
  const isEditable = analysisDocument.canWrite;
  const funnelSteps =
    "funnel.steps" in computed && computed["funnel.view"] === "steps"
      ? computed["funnel.steps"]
      : undefined;
  const hasInsights = definition.kind === "funnel";
  const { insertAnalysisBelow, showInsights } = analysisDocument;
  const mode = useMemo(
    () =>
      isEditable
        ? getDocumentDrillsMode({
            funnelSteps,
            onInsertBelow: (nextDefinition) =>
              insertAnalysisBelow(nodeId, nextDefinition),
            onShowInsights: hasInsights
              ? (transition) => showInsights(nodeId, transition)
              : undefined,
          })
        : undefined,
    [
      isEditable,
      funnelSteps,
      hasInsights,
      insertAnalysisBelow,
      showInsights,
      nodeId,
    ],
  );

  const resultProps = {
    title: config.question,
    display: analysis.display,
    vizSettings: analysis.vizSettings,
    dataset: query.dataset,
    datasetQuery: query.datasetQuery,
    isLoading: query.isLoading || !shouldLoadData,
    error:
      query.error ??
      (analysis.tableId === undefined
        ? t`Pick the event data to analyze.`
        : undefined),
    missing: analysis.missing,
  };
  const hasChart = getResultState(resultProps).isShowingVisualization;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    const { target, currentTarget } = event;
    // Portaled popovers (menus, drills) still bubble here through React.
    const isInCard = target instanceof Node && currentTarget.contains(target);
    const isOnControl =
      target instanceof Element &&
      target.closest(INTERACTIVE_SELECTOR) !== null;
    if (!isEditable || !isInCard || isOnControl) {
      return;
    }
    // A second click on the card being edited closes its panels.
    if (isEditing) {
      analysisDocument.stopEditing();
      return;
    }
    // Clicks on a chart are for its drills; a skeleton has none.
    const isOnChart =
      hasChart &&
      target instanceof Element &&
      target.closest(CHART_SELECTOR) !== null;
    if (isOnChart) {
      return;
    }
    const { panelTab } = analysisDocument;
    const isSettingsTabOpen = panelTab !== null && panelTab !== "insights";
    analysisDocument.startEditing(
      nodeId,
      isSettingsTabOpen ? undefined : "setup",
    );
  };

  return (
    <NodeViewWrapper
      className={S.wrapper}
      data-drag-handle
      data-testid="product-analysis-node"
      {...{ [ANALYSIS_CARD_ATTRIBUTE]: true }}
    >
      <Box
        ref={ref}
        className={cx(S.card, {
          [S.editable]: isEditable,
          [S.editing]: isEditing,
          [S.highlighted]: analysisDocument.highlightedNodeId === nodeId,
        })}
        aria-label={config.name}
        h={dragHeight ?? height}
        onClick={handleClick}
      >
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Box flex={1} miw={0}>
            {isEditing ? (
              <AnalysisCardToolbar
                title={config.name}
                onTitleClick={() => setIsChartModalOpen(true)}
                widgets={analysis.widgets}
                hasInsights={hasInsights && hasChart}
                panelTab={analysisDocument.panelTab}
                onPanelTabChange={analysisDocument.setPanelTab}
              />
            ) : (
              <Stack gap={0} miw={0} align="flex-start">
                <AnalysisTitleButton
                  title={config.name}
                  onClick={() => setIsChartModalOpen(true)}
                />
                <Text c="text-secondary">{config.question}</Text>
              </Stack>
            )}
          </Box>
          <AnalysisCardMenu
            title={config.name}
            dataset={hasChart ? query.dataset : undefined}
            commentsPath={commentsPath}
            canWrite={isEditable}
            onEdit={() => analysisDocument.startEditing(nodeId, "setup")}
            onRemove={() => {
              if (isEditing) {
                analysisDocument.stopEditing();
              }
              onRemove();
            }}
          />
        </Group>
        <Box className={S.chart} flex={1} mih={0} data-analysis-chart>
          <AnalysisResult {...resultProps} mode={mode} />
        </Box>
      </Box>
      {isChartModalOpen && (
        <AnalysisChartModal
          title={config.name}
          question={config.question}
          result={resultProps}
          onClose={() => setIsChartModalOpen(false)}
        />
      )}
      {isEditable && (
        <AnalysisResizeHandle
          onDrag={(deltaY) => setDragHeight(getResizedHeight(deltaY))}
          onDragEnd={(deltaY) => {
            onHeightChange(getResizedHeight(deltaY));
            setDragHeight(null);
          }}
        />
      )}
    </NodeViewWrapper>
  );
};
