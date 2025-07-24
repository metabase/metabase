import { Node, mergeAttributes } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import { utf8_to_b64url } from "metabase/lib/encoding";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Icon, Loader, Menu, Text, TextInput } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import Question from "metabase-lib/v1/Question";
import { getUrl } from "metabase-lib/v1/urls";
import type { Card } from "metabase-types/api";

import {
  openVizSettingsSidebar,
  selectQuestion,
} from "../../../../reports.slice";
import {
  getIsLoadingCard,
  getIsLoadingDataset,
  getReportCard,
  getReportRawSeries,
} from "../../../../selectors";

import { ModifyQuestionModal } from "./ModifyQuestionModal";
import styles from "./QuestionEmbedNode.module.css";

export interface QuestionEmbedAttributes {
  snapshotId?: number;
  questionId: number;
  questionName: string;
  customName?: string;
  model: string;
}
export const QuestionEmbedNode = Node.create<{
  HTMLAttributes: Record<string, any>;
}>({
  name: "questionEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      snapshotId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-snapshot-id")
            ? parseInt(element.getAttribute("data-snapshot-id") || "0")
            : null,
      },
      questionId: {
        default: null,
        parseHTML: (element) =>
          parseInt(element.getAttribute("data-question-id") || "0"),
      },
      questionName: {
        default: "",
      },
      customName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-custom-name"),
      },
      model: {
        default: "card",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="question-embed"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": "question-embed",
          "data-snapshot-id": node.attrs.snapshotId,
          "data-question-id": node.attrs.questionId,
          "data-question-name": node.attrs.questionName,
          "data-model": node.attrs.model,
        },
        this.options.HTMLAttributes,
      ),
      node.attrs.customName
        ? `{{card:${node.attrs.questionId}:${node.attrs.snapshotId}:${node.attrs.customName}}}`
        : `{{card:${node.attrs.questionId}:${node.attrs.snapshotId}}}`,
    ];
  },

  renderText({ node }) {
    if (node.attrs.customName) {
      return `{{card:${node.attrs.questionId}:${node.attrs.snapshotId}:${node.attrs.customName}}}`;
    }
    return `{{card:${node.attrs.questionId}:${node.attrs.snapshotId}}}`;
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("div");
      dom.setAttribute("data-type", "question-embed");
      dom.className = styles.embedContainer;

      const content = document.createElement("div");
      dom.appendChild(content);

      return {
        dom,
        contentDOM: content,
      };
    };
  },
});

export const QuestionEmbedComponent = memo(
  ({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) => {
    const { snapshotId, questionId, questionName, customName } = node.attrs;
    const dispatch = useDispatch();

    const card = useSelector((state) => getReportCard(state, questionId));
    const rawSeries = useSelector((state) =>
      getReportRawSeries(state, questionId, snapshotId),
    );
    const isLoadingCard = useSelector((state) =>
      getIsLoadingCard(state, questionId),
    );
    const isLoadingDataset = useSelector((state) =>
      getIsLoadingDataset(state, snapshotId),
    );
    const metadata = useSelector(getMetadata);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(customName || "");
    const titleInputRef = useRef<HTMLInputElement>(null);
    const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);

    const displayName = customName || card?.name || questionName;
    const isGuiQuestion = card?.dataset_query?.type !== "native";
    const isLoading = isLoadingCard || isLoadingDataset;

    // Only show error if we've tried to load and failed, not if we haven't tried yet
    const hasTriedToLoad = card || isLoadingCard || isLoadingDataset;
    const error =
      hasTriedToLoad && !isLoading && questionId && !card
        ? "Failed to load question"
        : null;

    useEffect(() => {
      if (isEditingTitle && titleInputRef.current) {
        titleInputRef.current.focus();
        titleInputRef.current.select();
      }
    }, [isEditingTitle]);

    const handleTitleSave = () => {
      const trimmedTitle = editedTitle.trim();
      if (trimmedTitle && trimmedTitle !== card?.name) {
        updateAttributes({ customName: trimmedTitle });
      } else {
        updateAttributes({ customName: null });
        setEditedTitle("");
      }
      setIsEditingTitle(false);
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTitleSave();
      } else if (e.key === "Escape") {
        setEditedTitle(customName || "");
        setIsEditingTitle(false);
      }
    };

    const handleReplaceQuestion = () => {
      // Get the position of this node in the editor
      const pos = editor.state.doc.nodeAt(0) ? getPos() : 0;

      if (typeof pos === "number") {
        editor
          .chain()
          .focus()
          .setTextSelection({ from: pos, to: pos + node.nodeSize })
          .deleteSelection()
          .insertContent("@")
          .run();
      }
    };

    const handleCopyStaticQuestion = () => {
      if (rawSeries && card) {
        const markdown = `{{static-card:${card.name}:series-${utf8_to_b64url(JSON.stringify(rawSeries[0].data))}:viz-${utf8_to_b64url(JSON.stringify(card.visualization_settings))}:display-${card.display}}}`;

        navigator.clipboard.writeText(markdown);
      }
    };

    const handleReplaceStaticQuestion = () => {
      const pos = editor.state.doc.nodeAt(0) ? getPos() : 0;

      if (typeof pos === "number" && card && rawSeries) {
        editor
          .chain()
          .focus()
          .setTextSelection({ from: pos, to: pos + node.nodeSize })
          .deleteSelection()
          .insertContent({
            type: "questionStatic",
            attrs: {
              questionName: card.name,
              series: utf8_to_b64url(JSON.stringify(rawSeries[0].data)),
              viz: utf8_to_b64url(JSON.stringify(card.visualization_settings)),
              display: card.display,
            },
          })
          .run();
      }
    };

    const handleEditVisualizationSettings = () => {
      dispatch(selectQuestion(questionId));
      dispatch(openVizSettingsSidebar(questionId));
    };

    // Handle drill-through navigation
    const handleChangeCardAndRun = useCallback(
      ({
        nextCard,
      }: {
        nextCard: Card;
        previousCard?: Card;
        objectId?: number;
      }) => {
        if (!metadata) {
          console.warn("Metadata not available for drill-through navigation");
          return;
        }

        try {
          // For drill-through, we need to ensure the card is treated as adhoc
          // Remove the ID so getUrl creates an adhoc question URL instead of navigating to saved question
          const adhocCard = { ...nextCard, id: null };
          const question = new Question(adhocCard, metadata);
          const url = getUrl(question, { includeDisplayIsLocked: true });
          dispatch(push(url));
        } catch (error) {
          console.error("Failed to create question URL:", error);
          // Fallback: navigate to a new question with the dataset_query
          if (nextCard.dataset_query) {
            const params = new URLSearchParams();
            params.set("dataset_query", JSON.stringify(nextCard.dataset_query));
            dispatch(push(`/question?${params.toString()}`));
          }
        }
      },
      [dispatch, metadata],
    );

    if (isLoading) {
      return (
        <NodeViewWrapper className={styles.embedWrapper}>
          <Box className={styles.loadingContainer}>
            <Loader size="sm" />
            <Text>Loading question...</Text>
          </Box>
        </NodeViewWrapper>
      );
    }

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
          className={`${styles.questionEmbed} ${selected ? styles.selected : ""}`}
        >
          {card && (
            <Box className={styles.questionHeader}>
              <Box
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                {isEditingTitle ? (
                  <TextInput
                    ref={titleInputRef}
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={handleTitleKeyDown}
                    size="md"
                    style={{ flex: 1 }}
                    styles={{
                      input: {
                        fontWeight: 700,
                        fontSize: "1rem",
                        border: "1px solid transparent",
                        padding: 0,
                        height: "auto",
                        minHeight: "auto",
                        lineHeight: 1.55,
                        backgroundColor: "transparent",
                        "&:focus": {
                          border: "1px solid var(--mb-color-border)",
                          backgroundColor: "var(--mb-color-bg-white)",
                          padding: "0 0.25rem",
                        },
                      },
                    }}
                  />
                ) : (
                  <Text
                    size="md"
                    color="text-dark"
                    fw={700}
                    onClick={() => {
                      setEditedTitle(displayName);
                      setIsEditingTitle(true);
                    }}
                    style={{ cursor: "pointer", flex: 1 }}
                  >
                    {displayName}
                  </Text>
                )}
                {!isEditingTitle && (
                  <Menu withinPortal position="bottom-end">
                    <Menu.Target>
                      <Box
                        component="button"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "0.25rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "4px",
                        }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Icon
                          name="ellipsis"
                          size={16}
                          color="var(--mb-color-text-medium)"
                        />
                      </Box>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={handleEditVisualizationSettings}>
                        {t`Edit Visualization`}
                      </Menu.Item>
                      {isGuiQuestion && (
                        <Menu.Item onClick={() => setIsModifyModalOpen(true)}>
                          {t`Edit Query`}
                        </Menu.Item>
                      )}
                      <Menu.Item onClick={handleReplaceQuestion}>
                        {t`Replace question`}
                      </Menu.Item>
                      <Menu.Item onClick={handleCopyStaticQuestion}>
                        {t`Copy Static Question Markdown`}
                      </Menu.Item>
                      <Menu.Item onClick={handleReplaceStaticQuestion}>
                        {t`Replace With Static Question`}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Box>
            </Box>
          )}
          {rawSeries ? (
            <>
              <Box className={styles.questionResults}>
                <Visualization
                  rawSeries={rawSeries}
                  metadata={metadata}
                  onChangeCardAndRun={handleChangeCardAndRun}
                  getExtraDataForClick={() => ({})}
                  isEditing={false}
                  isDashboard={false}
                  showTitle={false}
                />
              </Box>
              <Box className={styles.questionTimestamp}>
                {t`Snapshot At:`}
                <DateTime value={rawSeries[0].started_at} />
              </Box>
            </>
          ) : (
            <Box className={styles.loadingContainer}>
              <Loader size="sm" />
              <Text>Loading results...</Text>
            </Box>
          )}
        </Box>
        {isModifyModalOpen && card && (
          <ModifyQuestionModal
            card={card}
            isOpen={isModifyModalOpen}
            onClose={() => setIsModifyModalOpen(false)}
            onSave={(result) => {
              updateAttributes({
                questionId: result.card_id,
                questionName: result.name,
                snapshotId: result.snapshot_id,
                customName: null,
              });
              setIsModifyModalOpen(false);
            }}
          />
        )}
      </NodeViewWrapper>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function to prevent re-renders
    // Only re-render if these specific props change
    return (
      prevProps.node.attrs.snapshotId === nextProps.node.attrs.snapshotId &&
      prevProps.node.attrs.questionId === nextProps.node.attrs.questionId &&
      prevProps.node.attrs.questionName === nextProps.node.attrs.questionName &&
      prevProps.node.attrs.customName === nextProps.node.attrs.customName &&
      prevProps.selected === nextProps.selected
    );
  },
);

QuestionEmbedComponent.displayName = "QuestionEmbedComponent";
