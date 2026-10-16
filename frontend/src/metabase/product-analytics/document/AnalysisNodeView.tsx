import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import cx from "classnames";
import { type MouseEvent, useMemo, useState } from "react";
import { t } from "ttag";

import { Warnings } from "metabase/common/components/Warnings";
import { useEditorHost } from "metabase/rich_text_editing/tiptap/EditorHost";
import {
  Alert,
  Box,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "metabase/ui";
import type { ProductAnalyticsNodeDefinition } from "metabase-types/api";
import { getProductAnalyticsNodeDefinition } from "metabase-types/guards";

import {
  AnalysisResultBody,
  getResultState,
} from "../components/AnalysisResult";

import { AnalysisCardToolbar } from "./AnalysisCardToolbar";
import { useAnalysisDocument } from "./AnalysisDocumentContext";
import S from "./AnalysisNode.module.css";
import { getAnalysisNodeId } from "./analysis-node-utils";
import { getDocumentDrillsMode } from "./drills";
import { useDocumentAnalysis } from "./use-document-analysis";

const CHART_HEIGHT = 400;
const CHART_SELECTOR = "[data-analysis-chart]";

export const AnalysisNodeView = ({ node }: NodeViewProps) => {
  const nodeId = getAnalysisNodeId(node);
  const definition = getProductAnalyticsNodeDefinition(node.attrs.definition);

  if (nodeId === undefined || definition === undefined) {
    return (
      <NodeViewWrapper className={S.wrapper}>
        <Alert color="error">{t`This analysis can't be read.`}</Alert>
      </NodeViewWrapper>
    );
  }
  return <AnalysisCard nodeId={nodeId} definition={definition} />;
};

type AnalysisCardProps = {
  nodeId: string;
  definition: ProductAnalyticsNodeDefinition;
};

const AnalysisCard = ({ nodeId, definition }: AnalysisCardProps) => {
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
  const [vizWarnings, setVizWarnings] = useState<string[]>([]);

  const isEditing = analysisDocument.editingNodeId === nodeId;
  const isEditable = analysisDocument.canWrite;
  const funnelSteps =
    "funnel.steps" in computed && computed["funnel.view"] === "steps"
      ? computed["funnel.steps"]
      : undefined;
  const { insertAnalysisBelow } = analysisDocument;
  const mode = useMemo(
    () =>
      isEditable
        ? getDocumentDrillsMode({
            funnelSteps,
            onInsertBelow: (nextDefinition) =>
              insertAnalysisBelow(nodeId, nextDefinition),
          })
        : undefined,
    [isEditable, funnelSteps, insertAnalysisBelow, nodeId],
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
      (analysisDocument.tableId === undefined
        ? t`Pick the event data to analyze.`
        : undefined),
    missing: analysis.missing,
  };
  const warnings = getResultState(resultProps).isShowingVisualization
    ? [...query.warnings, ...vizWarnings]
    : query.warnings;

  const handleClick = (event: MouseEvent) => {
    const isOnChart =
      event.target instanceof Element &&
      event.target.closest(CHART_SELECTOR) !== null;
    if (isEditable && !isEditing && !isOnChart) {
      analysisDocument.startEditing(nodeId);
    }
  };

  return (
    <NodeViewWrapper
      className={S.wrapper}
      data-drag-handle
      data-testid="product-analysis-node"
    >
      <Box
        ref={ref}
        className={cx(S.card, {
          [S.editable]: isEditable,
          [S.editing]: isEditing,
          [S.highlighted]: analysisDocument.highlightedNodeId === nodeId,
        })}
        aria-label={config.name}
        onClick={handleClick}
      >
        {isEditing ? (
          <AnalysisCardToolbar
            widgets={analysis.widgets}
            setupLabel={config.setupLabel}
            sql={query.sql}
            hasInsights={definition.kind === "funnel"}
            panelTab={analysisDocument.panelTab}
            onPanelTabChange={analysisDocument.setPanelTab}
            onDone={analysisDocument.stopEditing}
          />
        ) : (
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Stack gap={0} miw={0}>
              <Title order={4}>{config.name}</Title>
              <Text c="text-secondary">{config.question}</Text>
            </Stack>
            <Group gap="sm" wrap="nowrap">
              <Warnings warnings={warnings} size={18} />
              {isEditable && (
                <UnstyledButton
                  className={S.editPrompt}
                  c="text-secondary"
                  aria-label={t`Edit analysis`}
                >
                  <Group gap="xs" wrap="nowrap">
                    <Icon name="pencil" />
                    <Text c="inherit">{t`Edit`}</Text>
                  </Group>
                </UnstyledButton>
              )}
            </Group>
          </Group>
        )}
        <Box className={S.chart} h={CHART_HEIGHT} data-analysis-chart>
          <AnalysisResultBody
            {...resultProps}
            setupLabel={config.setupLabel}
            onOpenSetup={
              isEditable
                ? () => analysisDocument.startEditing(nodeId, "setup")
                : undefined
            }
            mode={mode}
            onUpdateWarnings={setVizWarnings}
          />
        </Box>
      </Box>
    </NodeViewWrapper>
  );
};
