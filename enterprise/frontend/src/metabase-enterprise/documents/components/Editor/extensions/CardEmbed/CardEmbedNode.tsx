import { Node, mergeAttributes } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import cx from "classnames";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Icon, Loader, Menu, Text, TextInput } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import { getGenericErrorMessage } from "metabase/visualizations/lib/errors";
import Question from "metabase-lib/v1/Question";
import { getUrl } from "metabase-lib/v1/urls";
import type { Card, CardDisplayType, Dataset } from "metabase-types/api";

import {
  loadMetadataForDocumentCard,
  openVizSettingsSidebar,
  setShowNavigateBackToDocumentButton,
} from "../../../../documents.slice";
import { useCardEmbedData } from "../../../../hooks/useCardEmbedData";
import {
  useDocumentsDispatch,
  useDocumentsSelector,
} from "../../../../redux-utils";
import { EDITOR_STYLE_BOUNDARY_CLASS } from "../../constants";

import styles from "./CardEmbedNode.module.css";
import { ModifyQuestionModal } from "./ModifyQuestionModal";
import { NativeQueryModal } from "./NativeQueryModal";

function formatCardEmbed(attrs: CardEmbedAttributes): string {
  if (attrs.name) {
    return `{% card id=${attrs.id} name="${attrs.name}" %}`;
  } else {
    return `{% card id=${attrs.id} %}`;
  }
}

const getDatasetError = (dataset: Dataset) => {
  if (dataset.error) {
    return {
      message: getGenericErrorMessage(),
      icon: "warning" as const,
    };
  }
};

export interface CardEmbedAttributes {
  id?: number;
  name?: string;
  class?: string;
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

    // Use the custom hook for all data fetching
    const {
      card: cardToUse,
      dataset,
      isLoading,
      rawSeries,
      error,
    } = useCardEmbedData({ id });

    const metadata = useDocumentsSelector(getMetadata);
    const datasetError = dataset && getDatasetError(dataset);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(name || "");
    const titleInputRef = useRef<HTMLInputElement>(null);
    const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);

    const displayName = name || cardToUse?.name;
    const isNativeQuestion = cardToUse?.dataset_query?.type === "native";

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

    const documentsDispatch = useDocumentsDispatch();

    // Load metadata for the card
    useEffect(() => {
      if (cardToUse) {
        documentsDispatch(loadMetadataForDocumentCard(cardToUse));
      }
    }, [cardToUse, documentsDispatch]);

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

    if (isLoading && !cardToUse) {
      return (
        <NodeViewWrapper className={styles.embedWrapper}>
          <Box
            className={cx(styles.cardEmbed, EDITOR_STYLE_BOUNDARY_CLASS, {
              [styles.selected]: selected,
            })}
          >
            <Box className={styles.questionHeader}>
              <Flex align="center" justify="space-between" gap="0.5rem">
                <Box className={styles.titleContainer}>
                  <Text size="md" color="text-dark" fw={700}>
                    {t`Loading question...`}
                  </Text>
                </Box>
              </Flex>
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
      <NodeViewWrapper
        className={styles.embedWrapper}
        data-testid="document-card-embed"
      >
        <Box
          className={cx(styles.cardEmbed, EDITOR_STYLE_BOUNDARY_CLASS, {
            [styles.selected]: selected,
          })}
        >
          {cardToUse && (
            <Box className={styles.questionHeader}>
              <Flex align="center" justify="space-between" gap="0.5rem">
                {isEditingTitle ? (
                  <TextInput
                    ref={titleInputRef}
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={handleTitleKeyDown}
                    size="md"
                    flex={1}
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
                      c="pointer"
                    >
                      {displayName}
                    </Text>
                    {canWrite && (
                      <Icon
                        name="pencil"
                        size={14}
                        color="var(--mb-color-text-medium)"
                        className={styles.titleEditIcon}
                        c="pointer"
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
                      <Flex
                        component="button"
                        bg="transparent"
                        c="pointer"
                        p="0.25rem"
                        align="center"
                        justify="center"
                        style={{
                          border: "none",
                          borderRadius: "4px",
                        }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Icon
                          name="ellipsis"
                          size={16}
                          color="var(--mb-color-text-medium)"
                        />
                      </Flex>
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
                        {t`Replace`}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Flex>
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
                  isDocument={true}
                  showTitle={false}
                  error={datasetError?.message}
                  errorIcon={datasetError?.icon}
                />
              </Box>
            </>
          ) : (
            <Box className={styles.questionResults}>
              <ChartSkeleton
                display={(cardToUse?.display as CardDisplayType) || "table"}
              />
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
