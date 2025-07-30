import { Node, mergeAttributes } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import { useDispatch } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Icon, Loader, Menu, Text, TextInput } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import Question from "metabase-lib/v1/Question";
import { getUrl } from "metabase-lib/v1/urls";
import type { Card } from "metabase-types/api";

import { useCreateReportSnapshotMutation } from "../../../../../api/report";
import { useReportsSelector } from "../../../../redux-utils";
import { openVizSettingsSidebar } from "../../../../reports.slice";
import {
  getIsLoadingCard,
  getIsLoadingDataset,
  getReportCard,
  getReportRawSeries,
  getReportRawSeriesWithDraftSettings,
  getSelectedEmbedIndex,
} from "../../../../selectors";
import { formatCardEmbed } from "../markdown/card-embed-format";

import styles from "./CardEmbedNode.module.css";
import { ModifyQuestionModal } from "./ModifyQuestionModal";

export interface CardEmbedAttributes {
  id: number;
  snapshotId?: number;
  name?: string;
}
export const CardEmbedNode = Node.create<{
  HTMLAttributes: Record<string, any>;
}>({
  name: "cardEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      snapshotId: {
        default: null,
        parseHTML: (element) => {
          const snapshotId = element.getAttribute("data-snapshot-id");
          if (snapshotId) {
            return parseInt(snapshotId);
          }
          return null;
        },
      },
      id: {
        default: null,
        parseHTML: (element) => {
          const id = element.getAttribute("data-id");
          if (id) {
            return parseInt(id);
          }
          return null;
        },
      },
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-name"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${CardEmbedNode.name}"]`,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": CardEmbedNode.name,
          "data-snapshot-id": node.attrs.snapshotId,
          "data-id": node.attrs.id,
          "data-name": node.attrs.name,
        },
        this.options.HTMLAttributes,
      ),
      formatCardEmbed(node.attrs),
    ];
  },

  renderText({ node }) {
    return formatCardEmbed(node.attrs);
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("div");
      dom.setAttribute("data-type", CardEmbedNode.name);
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

export const CardEmbedComponent = memo(
  ({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) => {
    const { snapshotId, id, name } = node.attrs;
    const dispatch = useDispatch();
    const canWrite = editor.options.editable;

    let embedIndex = -1;

    if (editor && getPos) {
      const currentPos = getPos() ?? 0;
      let nodeCount = 0;

      // Count cardEmbed nodes that appear before this position
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "cardEmbed") {
          if (pos < currentPos) {
            nodeCount++;
          } else if (pos === currentPos) {
            embedIndex = nodeCount;
            return false; // Stop traversing
          }
        }
      });
    }

    const card = useReportsSelector((state) => getReportCard(state, id));
    const selectedEmbedIndex = useReportsSelector(getSelectedEmbedIndex);
    const isCurrentlyEditing =
      selectedEmbedIndex === embedIndex && embedIndex !== -1;

    // Use draft settings if this embed is currently being edited
    const rawSeries = useReportsSelector((state) =>
      isCurrentlyEditing
        ? getReportRawSeriesWithDraftSettings(state, id, snapshotId)
        : getReportRawSeries(state, id, snapshotId),
    );
    const isLoadingCard = useReportsSelector((state) =>
      getIsLoadingCard(state, id),
    );
    const isLoadingDataset = useReportsSelector((state) =>
      getIsLoadingDataset(state, snapshotId),
    );
    const metadata = useReportsSelector(getMetadata);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(name || "");
    const titleInputRef = useRef<HTMLInputElement>(null);
    const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
    const [createReportSnapshot] = useCreateReportSnapshotMutation();

    const displayName = name || card?.name;
    const isGuiQuestion = card?.dataset_query?.type !== "native";
    const isLoading = isLoadingCard || isLoadingDataset;

    // Only show error if we've tried to load and failed, not if we haven't tried yet
    const hasTriedToLoad = card || isLoadingCard || isLoadingDataset;
    const error =
      hasTriedToLoad && !isLoading && id && !card
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
        updateAttributes({ name: trimmedTitle });
      } else {
        updateAttributes({ name: null });
        setEditedTitle("");
      }
      setIsEditingTitle(false);
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTitleSave();
      } else if (e.key === "Escape") {
        setEditedTitle(name || "");
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

    const handleEditVisualizationSettings = () => {
      if (embedIndex !== -1) {
        dispatch(openVizSettingsSidebar({ embedIndex }));
      }
    };

    const handleTitleClick = () => {
      if (card && metadata) {
        try {
          const question = new Question(card, metadata);
          const url = getUrl(question, { includeDisplayIsLocked: true });
          dispatch(push(url));
        } catch (error) {
          console.error("Failed to navigate to question:", error);
        }
      }
    };

    const handleRefreshSnapshot = async () => {
      if (!card) {
        return;
      }

      try {
        const result = await createReportSnapshot({
          card_id: id,
        }).unwrap();

        updateAttributes({
          snapshotId: result.snapshot_id,
        });
      } catch (error) {
        console.error("Failed to refresh snapshot:", error);
      }
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
            <Text color="error">{t`Failed to load question`}</Text>
          </Box>
        </NodeViewWrapper>
      );
    }

    return (
      <NodeViewWrapper className={styles.embedWrapper}>
        <Box
          className={`${styles.cardEmbed} ${selected ? styles.selected : ""}`}
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
                  <Box className={styles.titleContainer}>
                    <Text
                      size="md"
                      color="text-dark"
                      fw={700}
                      onClick={handleTitleClick}
                      style={{ cursor: "pointer" }}
                    >
                      {displayName}
                    </Text>
                    {canWrite && (
                      <Icon
                        name="pencil"
                        size={14}
                        color="var(--mb-color-text-medium)"
                        className={styles.titleEditIcon}
                        style={{ cursor: "pointer" }}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setEditedTitle(displayName);
                          setIsEditingTitle(true);
                        }}
                      />
                    )}
                  </Box>
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
                      <Menu.Item
                        onClick={handleRefreshSnapshot}
                        disabled={!canWrite}
                      >
                        {t`Refresh snapshot`}
                      </Menu.Item>
                      <Menu.Item
                        onClick={handleEditVisualizationSettings}
                        disabled={!canWrite}
                      >
                        {t`Edit Visualization`}
                      </Menu.Item>
                      {isGuiQuestion && (
                        <Menu.Item
                          onClick={() => setIsModifyModalOpen(true)}
                          disabled={!canWrite}
                        >
                          {t`Edit Query`}
                        </Menu.Item>
                      )}
                      <Menu.Item
                        onClick={handleReplaceQuestion}
                        disabled={!canWrite}
                      >
                        {t`Replace question`}
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
              {rawSeries[0].started_at && (
                <Box className={styles.questionTimestamp}>
                  {t`Snapshot at:`}
                  <DateTime value={rawSeries[0].started_at} />
                </Box>
              )}
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
                id: result.card_id,
                snapshotId: result.snapshot_id,
                name: null,
              });
              setIsModifyModalOpen(false);
            }}
          />
        )}
      </NodeViewWrapper>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.node.attrs.snapshotId === nextProps.node.attrs.snapshotId &&
      prevProps.node.attrs.id === nextProps.node.attrs.id &&
      prevProps.node.attrs.name === nextProps.node.attrs.name &&
      prevProps.selected === nextProps.selected
    );
  },
);

CardEmbedComponent.displayName = "CardEmbedComponent";
