import { Node, mergeAttributes, nodePasteRule } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { memo } from "react";
import { t } from "ttag";

import { Box, Loader, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { getReportRawSeries } from "metabase-enterprise/reports/selectors";

import { useReportsSelector } from "../../../../redux-utils";
import styles from "../CardEmbed/CardEmbedNode.module.css";

export const STATIC_CARD_REGEX =
  /{{static-card(?::(?!series-)(?!viz-)(?!display-)([^}:]+))(?::series-([^:]+))(?::viz-([^:]+))(?::display-([^:]+))}}/g;

export interface CardEmbedAttributes {
  cardId: number;
  questionName: string;
  customName?: string;
  model: string;
}
export const CardStaticNode = Node.create<{
  HTMLAttributes: Record<string, any>;
}>({
  name: "cardStatic",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      questionName: {
        parseHTML: (element) => element.getAttribute("data-question-name"),
      },
      series: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-series"),
      },
      viz: {
        default: {},
        parseHTML: (element) => element.getAttribute("data-viz"),
      },
      display: {
        default: {},
        parseHTML: (element) => element.getAttribute("data-display"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="question-static"]',
      },
    ];
  },

  renderText({ node }) {
    return `{{static-card:${node.attrs.questionName}:series-${node.attrs.series}:viz-${node.attrs.viz}:display-${node.attrs.display}}}`;
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": "question-static",
          "data-question-name": node.attrs.questionName,
          "data-series": node.attrs.series,
          "data-viz": node.attrs.viz,
          "data-display": node.attrs.display,
        },
        this.options.HTMLAttributes,
      ),
      `{{static-card:${node.attrs.questionName}:series-${node.attrs.series}:viz-${node.attrs.viz}:display-${node.attrs.display}}}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuestionStaticComponent);
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: STATIC_CARD_REGEX,
        type: this.type,
        getAttributes(match) {
          const [_match, questionName, series, viz, display] = match;
          return {
            questionName,
            series,
            viz,
            display,
          };
        },
      }),
    ];
  },
});

export const QuestionStaticComponent = memo(
  ({ node, selected }: NodeViewProps) => {
    const { questionName, id } = node.attrs;

    const rawSeries = useReportsSelector((state) =>
      getReportRawSeries(state, id),
    );

    const error = !rawSeries;

    if (error) {
      return (
        <NodeViewWrapper className={styles.embedWrapper}>
          <Box className={styles.errorContainer}>
            <Text color="error">{t`Failed to load question: {questionName}`}</Text>
          </Box>
        </NodeViewWrapper>
      );
    }

    return (
      <NodeViewWrapper className={styles.embedWrapper}>
        <Box
          className={`${styles.cardEmbed} ${selected ? styles.selected : ""}`}
        >
          {questionName && (
            <Box className={styles.questionHeader}>
              <Box
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <Text
                  size="md"
                  c="text-dark"
                  fw={700}
                  style={{ cursor: "pointer", flex: 1 }}
                >
                  {`${questionName} - Static`}
                </Text>
              </Box>
            </Box>
          )}
          {rawSeries ? (
            <Box className={styles.questionResults}>
              <Visualization
                rawSeries={rawSeries}
                isEditing={false}
                isDashboard={false}
              />
            </Box>
          ) : (
            <Box className={styles.loadingContainer}>
              <Loader size="sm" />
              <Text>Loading results...</Text>
            </Box>
          )}
        </Box>
      </NodeViewWrapper>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function to prevent re-renders
    // Only re-render if these specific props change
    return (
      prevProps.node.attrs.cardId === nextProps.node.attrs.cardId &&
      prevProps.node.attrs.questionName === nextProps.node.attrs.questionName &&
      prevProps.node.attrs.customName === nextProps.node.attrs.customName &&
      prevProps.node.attrs.series === nextProps.node.attrs.series &&
      prevProps.node.attrs.viz === nextProps.node.attrs.viz &&
      prevProps.selected === nextProps.selected
    );
  },
);

QuestionStaticComponent.displayName = "QuestionStaticComponent";
