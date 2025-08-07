import { Node, mergeAttributes } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import cx from "classnames";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import {
  useGetAdhocQueryMetadataQuery,
  useGetAdhocQueryQuery,
} from "metabase/api/dataset";
import { useDispatch } from "metabase/lib/redux";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Icon, Loader, Menu, Text, TextInput } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import Question from "metabase-lib/v1/Question";
import { getUrl } from "metabase-lib/v1/urls";
import type { Card } from "metabase-types/api";

import {
  openVizSettingsSidebar,
  setShowNavigateBackToDocumentButton,
} from "../../../../documents.slice";
import { useDocumentsSelector } from "../../../../redux-utils";
import { getCardWithDraft } from "../../../../selectors";
import { EDITOR_STYLE_BOUNDARY_CLASS } from "../../constants";
import { formatCardEmbed } from "../markdown/card-embed-format";

import styles from "./CardEmbedNode.module.css";
import { ModifyQuestionModal } from "./ModifyQuestionModal";
import { NativeQueryModal } from "./NativeQueryModal";

export interface CardEmbedAttributes {
  id: number;
  name?: string;
}
export const CardEmbedNode: Node<{
  HTMLAttributes: CardEmbedAttributes;
}> = Node.create({
  name: "cardEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
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
          "data-id": node.attrs.id,
          "data-name": node.attrs.name,
        },
        this.options.HTMLAttributes,
      ),
      formatCardEmbed(node.attrs as CardEmbedAttributes),
    ];
  },

  renderText({ node }) {
    return formatCardEmbed(node.attrs as CardEmbedAttributes);
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
    const { id, name } = node.attrs;
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

    const { data: card, isLoading: isLoadingCard } = useGetCardQuery(
      { id },
      { skip: !id || id < 0 }, // Skip if draft card (negative ID)
    );

    // Get card with draft if available
    const cardWithDraft = useDocumentsSelector((state) =>
      getCardWithDraft(state, id, card),
    );

    // Use the draft card if available, otherwise use the fetched card
    const cardToUse = cardWithDraft ?? card;

    // Use different endpoints for draft vs regular cards
    const { data: regularDataset, isLoading: isLoadingRegularDataset } =
      useGetCardQueryQuery(
        { cardId: id },
        { skip: !id || id < 0 || !card }, // Skip for draft cards
      );

    const { data: draftDataset, isLoading: isLoadingDraftDataset } =
      useGetAdhocQueryQuery(
        id < 0 && cardToUse?.dataset_query
          ? {
              ...cardToUse.dataset_query,
              database: cardToUse.database_id ?? null,
              parameters: [],
            }
          : skipToken,
      );

    // Use appropriate dataset based on card type
    const dataset = id < 0 ? draftDataset : regularDataset;
    const isLoadingDataset =
      id < 0 ? isLoadingDraftDataset : isLoadingRegularDataset;

    const rawSeries =
      cardToUse && dataset?.data
        ? [
            {
              card: cardToUse,
              started_at: dataset.started_at,
              data: dataset.data,
            },
          ]
        : null;

    const metadata = useDocumentsSelector(getMetadata);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(name || "");
    const titleInputRef = useRef<HTMLInputElement>(null);
    const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);

    const displayName = name || cardToUse?.name;
    const isNativeQuestion = cardToUse?.dataset_query?.type === "native";
    const isLoading = isLoadingCard || isLoadingDataset;

    // Only show error if we've tried to load and failed, not if we haven't tried yet
    const hasTriedToLoad =
      cardToUse !== undefined || isLoadingCard || isLoadingDataset;
    const error =
      hasTriedToLoad && !isLoading && id && !cardToUse
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
      if (trimmedTitle && trimmedTitle !== cardToUse?.name) {
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

    // Load metadata for the card
    const { data: adhocMetadata } = useGetAdhocQueryMetadataQuery(
      id < 0 && cardToUse?.dataset_query ? cardToUse.dataset_query : skipToken,
    );

    useEffect(() => {
      if (cardToUse && id >= 0) {
        // For regular cards, use the loadMetadataForCard action
        dispatch(loadMetadataForCard(cardToUse));
      }
    }, [cardToUse, dispatch, adhocMetadata, id]);

    const handleEditVisualizationSettings = () => {
      if (embedIndex !== -1) {
        dispatch(openVizSettingsSidebar({ embedIndex }));
      }
    };

    const handleTitleClick = () => {
      if (cardToUse && metadata) {
        try {
          dispatch(setShowNavigateBackToDocumentButton(true));
          const isDraftCard = cardToUse.id < 0;
          const question = new Question(
            isDraftCard ? { ...cardToUse, id: null } : cardToUse,
            metadata,
          );
          const url = getUrl(question, { includeDisplayIsLocked: true });
          dispatch(push(url));
        } catch (error) {
          console.error("Failed to navigate to question:", error);
        }
      }
    };

    const handleReplaceQuestion = () => {
      const pos = getPos();

      if (typeof pos === "number") {
        editor.commands.insertContentAt(
          { from: pos, to: pos + node.nodeSize },
          "/",
        );
        editor.commands.focus();
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
          dispatch(setShowNavigateBackToDocumentButton(true));
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
            dispatch(setShowNavigateBackToDocumentButton(true));
            const params = new URLSearchParams();
            params.set("dataset_query", JSON.stringify(nextCard.dataset_query));
            dispatch(push(`/question?${params.toString()}`));
          }
        }
      },
      [dispatch, metadata],
    );

    if (isLoadingCard && !cardToUse) {
      return (
        <NodeViewWrapper className={styles.embedWrapper}>
          <Box
            className={cx(styles.cardEmbed, EDITOR_STYLE_BOUNDARY_CLASS, {
              [styles.selected]: selected,
            })}
          >
            <Box className={styles.questionHeader}>
              <Box
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <Box className={styles.titleContainer}>
                  <Text size="md" color="text-dark" fw={700}>
                    {t`Loading question...`}
                  </Text>
                </Box>
              </Box>
            </Box>
            <Box className={styles.questionResults}>
              <Box className={styles.loadingContainer}>
                <Loader />
              </Box>
            </Box>
          </Box>
        </NodeViewWrapper>
      );
    }

    if (error) {
      return (
        <NodeViewWrapper className={styles.embedWrapper}>
          <Box
            className={cx(styles.errorContainer, EDITOR_STYLE_BOUNDARY_CLASS)}
          >
            <Text color="error">{t`Failed to load question`}</Text>
          </Box>
        </NodeViewWrapper>
      );
    }

    return (
      <NodeViewWrapper className={styles.embedWrapper}>
        <Box
          className={cx(styles.cardEmbed, EDITOR_STYLE_BOUNDARY_CLASS, {
            [styles.selected]: selected,
          })}
        >
          {cardToUse && (
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
                        onClick={handleEditVisualizationSettings}
                        disabled={!canWrite}
                        leftSection={<Icon name="palette" size={14} />}
                      >
                        {t`Edit Visualization`}
                      </Menu.Item>
                      <Menu.Item
                        onClick={() => setIsModifyModalOpen(true)}
                        disabled={!canWrite}
                        leftSection={
                          <Icon
                            name={isNativeQuestion ? "sql" : "notebook"}
                            size={14}
                          />
                        }
                      >
                        {t`Edit Query`}
                      </Menu.Item>
                      <Menu.Item
                        onClick={handleReplaceQuestion}
                        disabled={!canWrite}
                        leftSection={<Icon name="refresh" size={14} />}
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
            </>
          ) : (
            <Box className={styles.questionResults}>
              <ChartSkeleton display={cardToUse?.display || "table"} />
            </Box>
          )}
        </Box>
        {isModifyModalOpen &&
          cardToUse &&
          (isNativeQuestion ? (
            <NativeQueryModal
              card={cardToUse}
              isOpen={isModifyModalOpen}
              onClose={() => setIsModifyModalOpen(false)}
              editor={editor}
              initialDataset={dataset}
              onSave={(result) => {
                updateAttributes({
                  id: result.card_id,
                  name: null,
                });
                setIsModifyModalOpen(false);
              }}
            />
          ) : (
            <ModifyQuestionModal
              card={cardToUse}
              isOpen={isModifyModalOpen}
              onClose={() => setIsModifyModalOpen(false)}
              editor={editor}
              onSave={(result) => {
                updateAttributes({
                  id: result.card_id,
                  name: null,
                });
                setIsModifyModalOpen(false);
              }}
            />
          ))}
      </NodeViewWrapper>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.node.attrs.id === nextProps.node.attrs.id &&
      prevProps.node.attrs.name === nextProps.node.attrs.name &&
      prevProps.selected === nextProps.selected
    );
  },
);

CardEmbedComponent.displayName = "CardEmbedComponent";
