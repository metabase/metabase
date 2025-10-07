import { Node, mergeAttributes } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { push } from "react-router-redux";
import { useMount, useUnmount } from "react-use";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { ForwardRefLink } from "metabase/common/components/Link";
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Icon, Loader, Menu, Text, TextInput } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView/ErrorView";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import { getGenericErrorMessage } from "metabase/visualizations/lib/errors";
import { useListCommentsQuery } from "metabase-enterprise/api";
import { getTargetChildCommentThreads } from "metabase-enterprise/comments/utils";
import { navigateToCardFromDocument } from "metabase-enterprise/documents/actions";
import { trackDocumentReplaceCard } from "metabase-enterprise/documents/analytics";
import { getUnresolvedComments } from "metabase-enterprise/documents/components/Editor/CommentsMenu";
import { EDITOR_STYLE_BOUNDARY_CLASS } from "metabase-enterprise/documents/components/Editor/constants";
import {
  loadMetadataForDocumentCard,
  openVizSettingsSidebar,
} from "metabase-enterprise/documents/documents.slice";
import { useCardData } from "metabase-enterprise/documents/hooks/use-card-data";
import {
  getChildTargetId,
  getCurrentDocument,
  getHasUnsavedChanges,
  getHoveredChildTargetId,
} from "metabase-enterprise/documents/selectors";
import { getListCommentsQuery } from "metabase-enterprise/documents/utils/api";
import Question from "metabase-lib/v1/Question";
import { getUrl } from "metabase-lib/v1/urls";
import type { Card, CardDisplayType, Dataset } from "metabase-types/api";

import { CommentsButton } from "../../components/CommentsButton";
import {
  cleanupFlexContainerNodes,
  findNodeParentAndPos,
} from "../HandleEditorDrop/utils";
import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import CS from "../extensions.module.css";

import styles from "./CardEmbedNode.module.css";
import { ModifyQuestionModal } from "./ModifyQuestionModal";
import { NativeQueryModal } from "./NativeQueryModal";

export const DROP_ZONE_COLOR = "var(--mb-color-brand)";
const DRAG_LEAVE_TIMEOUT = 300;

interface DropZoneProps {
  isOver: boolean;
  side: "left" | "right";
  disabled?: boolean;
}

const DropZone = ({ isOver, side, disabled }: DropZoneProps) => {
  if (disabled) {
    return null;
  }

  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "0.25rem",
        [side]: "-0.625rem",
        borderRadius: "0.125rem",
        backgroundColor: isOver
          ? "var(--mb-base-color-blue-30)"
          : "transparent",
        zIndex: 10,
        pointerEvents: "all",
      }}
    />
  );
};

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
export const CardEmbed: Node<{
  HTMLAttributes: CardEmbedAttributes;
}> = Node.create({
  name: "cardEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  disableDropCursor: true,

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
      ...createIdAttribute(),
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${CardEmbed.name}"]`,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": CardEmbed.name,
          "data-id": node.attrs.id,
          "data-name": node.attrs.name,
        },
        this.options.HTMLAttributes,
      ),
      formatCardEmbed(node.attrs as CardEmbedAttributes),
    ];
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin("cardEmbed")];
  },

  renderText({ node }) {
    return formatCardEmbed(node.attrs as CardEmbedAttributes);
  },

  addNodeView() {
    return ReactNodeViewRenderer(CardEmbedComponent);
  },
});

export const CardEmbedComponent = memo(
  ({
    node,
    updateAttributes,
    selected,
    editor,
    getPos,
    deleteNode,
  }: NodeViewProps) => {
    const childTargetId = useSelector(getChildTargetId);
    const hoveredChildTargetId = useSelector(getHoveredChildTargetId);
    const document = useSelector(getCurrentDocument);
    const { data: commentsData } = useListCommentsQuery(
      getListCommentsQuery(document),
    );

    const comments = commentsData?.comments;
    const hasUnsavedChanges = useSelector(getHasUnsavedChanges);
    const { _id } = node.attrs;
    const isOpen = childTargetId === _id;
    const isHovered = hoveredChildTargetId === _id;
    const threads = useMemo(
      () => getTargetChildCommentThreads(comments, _id),
      [comments, _id],
    );
    const unresolvedCommentsCount = useMemo(
      () => getUnresolvedComments(threads).length,
      [threads],
    );
    const commentsPath = document
      ? `/document/${document.id}/comments/${_id}`
      : "";
    const { id, name } = node.attrs;
    const dispatch = useDispatch();
    const canWrite = editor.options.editable;

    const isMountedRef = useRef(false);

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

    const { card, dataset, isLoading, series, error } = useCardData({ id });

    const metadata = useSelector(getMetadata);
    const datasetError = dataset && getDatasetError(dataset);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(name || "");
    const titleInputRef = useRef<HTMLInputElement>(null);
    const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
    const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
    const [dragState, setDragState] = useState<{
      isDraggedOver: boolean;
      side: "left" | "right" | null;
    }>({ isDraggedOver: false, side: null });
    const draggedOverTimeoutRef = useRef<number | undefined>();
    const cardEmbedRef = useRef<HTMLDivElement>(null);

    const isBeingDragged = editor.view.draggingNode === node;

    const displayName = name || card?.name;
    const question =
      card?.dataset_query != null ? new Question(card) : undefined;
    const isNativeQuestion = question?.isNative();

    useEffect(() => {
      if (isEditingTitle && titleInputRef.current) {
        titleInputRef.current.focus();
        titleInputRef.current.select();
      }
    }, [isEditingTitle]);

    useMount(() => {
      isMountedRef.current = true;
    });

    useUnmount(() => {
      isMountedRef.current = false;
    });

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

    // Load metadata for the card
    useEffect(() => {
      if (card) {
        dispatch(loadMetadataForDocumentCard(card));
      }
    }, [card, dispatch]);

    const handleEditVisualizationSettings = () => {
      if (embedIndex !== -1) {
        dispatch(openVizSettingsSidebar({ embedIndex }));
      }
    };

    const handleTitleClick = () => {
      if (card && metadata) {
        try {
          const isDraftCard = card.id < 0;
          const question = new Question(
            isDraftCard ? { ...card, id: null } : card,
            metadata,
          );
          const url = getUrl(question, { includeDisplayIsLocked: true });
          dispatch(navigateToCardFromDocument(url, document));
        } catch (error) {
          console.error("Failed to navigate to question:", error);
        }
      }
    };

    const handleReplaceQuestion = () => {
      setIsReplaceModalOpen(true);
    };

    const handleReplaceModalSelect = useCallback(
      (item: QuestionPickerValueItem) => {
        updateAttributes({
          id: item.id,
          name: null,
        });
        if (document) {
          trackDocumentReplaceCard(document);
        }

        setIsReplaceModalOpen(false);
      },
      [updateAttributes, document],
    );

    const handleRemoveNode = useCallback(() => {
      const nodeParentResult = findNodeParentAndPos(editor.view, node);

      if (
        nodeParentResult &&
        nodeParentResult.parent.type.name === "resizeNode"
      ) {
        const { parent, parentPos } = nodeParentResult;
        editor.view.dispatch(
          editor.state.tr.delete(parentPos, parentPos + parent.nodeSize),
        );
      } else {
        deleteNode();
      }
      cleanupFlexContainerNodes(editor.view);
      editor.chain().focus();
    }, [deleteNode, editor, node]);

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
          dispatch(navigateToCardFromDocument(url, document));
        } catch (error) {
          console.error("Failed to create question URL:", error);
          // Fallback: navigate to a new question with the dataset_query
          if (nextCard.dataset_query) {
            const params = new URLSearchParams();
            params.set("dataset_query", JSON.stringify(nextCard.dataset_query));
            dispatch(
              navigateToCardFromDocument(
                `/question?${params.toString()}`,
                document,
              ),
            );
          }
        }
      },
      [dispatch, metadata, document],
    );

    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();

        const draggingNode = editor.view.draggingNode;
        if (
          draggingNode &&
          draggingNode.type.name === "cardEmbed" &&
          cardEmbedRef.current
        ) {
          // Check if this cardEmbed is in a flexContainer that already has 3 children
          const pos = getPos();
          if (pos) {
            const resolvedPos = editor.state.doc.resolve(pos);
            const { parent } = resolvedPos;

            if (
              parent.type.name === "flexContainer" &&
              parent.content.childCount >= 3
            ) {
              let containsDraggedNode = false;

              for (let i = 0; i < parent.content.childCount; i++) {
                const child = parent.child(i);
                containsDraggedNode =
                  containsDraggedNode || child === draggingNode;
              }

              if (!containsDraggedNode) {
                // Don't show drop zones if flexContainer is already at max capacity
                setDragState({ isDraggedOver: false, side: null });
                return;
              }
            }
          }

          const rect = cardEmbedRef.current.getBoundingClientRect();
          const relativeX = e.clientX - rect.left;
          const nodeWidth = rect.width;

          // Determine which side based on cursor position
          let side: "left" | "right" | null = null;
          if (relativeX < nodeWidth * 0.5) {
            side = "left";
          } else if (relativeX >= nodeWidth * 0.5) {
            side = "right";
          }

          setDragState({ isDraggedOver: true, side });

          window.clearTimeout(draggedOverTimeoutRef.current);

          draggedOverTimeoutRef.current = window.setTimeout(() => {
            if (isMountedRef.current) {
              setDragState({ isDraggedOver: false, side: null });
            }
          }, DRAG_LEAVE_TIMEOUT);
        }
      },
      [editor.view.draggingNode, getPos, editor.state.doc],
    );

    if (isLoading && !card) {
      return (
        <NodeViewWrapper
          aria-expanded={isOpen}
          className={cx(styles.embedWrapper, CS.root, {
            [CS.open]: isOpen || isHovered,
          })}
          style={{ position: "relative" }}
        >
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
        <NodeViewWrapper
          aria-expanded={isOpen}
          className={cx(styles.embedWrapper, CS.root, {
            [CS.open]: isOpen || isHovered,
          })}
          data-testid="document-card-embed"
          style={{ position: "relative" }}
        >
          <Box
            className={cx(styles.cardEmbed, EDITOR_STYLE_BOUNDARY_CLASS, {
              [styles.selected]: selected,
            })}
          >
            <Flex className={styles.questionResults}>
              <ErrorView
                error={
                  error === "not found"
                    ? t`Couldn't find this chart.`
                    : t`Failed to load question.`
                }
              />
            </Flex>
          </Box>
        </NodeViewWrapper>
      );
    }

    return (
      <>
        <NodeViewWrapper
          aria-expanded={isOpen}
          className={cx(styles.embedWrapper, CS.root, {
            [CS.open]: isOpen || isHovered,
          })}
          data-testid="document-card-embed"
          data-drag-handle
          onDragOver={handleDragOver}
          onDrop={() => setDragState({ isDraggedOver: false, side: null })}
        >
          {canWrite && id && (
            <>
              <DropZone
                isOver={dragState.isDraggedOver && dragState.side === "left"}
                side="left"
                disabled={isBeingDragged}
              />
              <DropZone
                isOver={dragState.isDraggedOver && dragState.side === "right"}
                side="right"
                disabled={isBeingDragged}
              />
            </>
          )}
          <Box
            ref={cardEmbedRef}
            className={cx(styles.cardEmbed, EDITOR_STYLE_BOUNDARY_CLASS, {
              [styles.selected]: selected,
            })}
          >
            {card && (
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
                      <Ellipsified lines={1} tooltip={displayName}>
                        <Text
                          className={styles.titleText}
                          data-testid="card-embed-title"
                          size="md"
                          color="text-dark"
                          fw={700}
                          c="pointer"
                          truncate="end"
                          onClick={handleTitleClick}
                        >
                          {displayName}
                        </Text>
                      </Ellipsified>
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
                  {!isEditingTitle &&
                    document &&
                    unresolvedCommentsCount > 0 && (
                      <Box data-hide-on-print my="-sm" ml="auto">
                        <CommentsButton
                          // don't use Link component here since it messes with tiptap's link handling
                          disabled={hasUnsavedChanges || !commentsPath}
                          variant={isOpen ? "filled" : "default"}
                          unresolvedCommentsCount={unresolvedCommentsCount}
                          onClick={() => {
                            dispatch(push(commentsPath));
                          }}
                        />
                      </Box>
                    )}
                  {!isEditingTitle && (
                    <Menu withinPortal position="bottom-end" data-hide-on-print>
                      <Menu.Target>
                        <Flex
                          component="button"
                          p="0.25rem"
                          align="center"
                          justify="center"
                          className={styles.menuButton}
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
                          leftSection={<Icon name="add_comment" size={14} />}
                          component={ForwardRefLink}
                          to={
                            // If no existing unresolved comments comments, add query param to auto-open new comment form
                            unresolvedCommentsCount > 0
                              ? commentsPath
                              : `${commentsPath}?new=true`
                          }
                          // actually stop the navigation from happening
                          onClick={(e) => {
                            if (!commentsPath || hasUnsavedChanges) {
                              e.preventDefault();
                            }
                          }}
                          // purely for presentation
                          disabled={!commentsPath || hasUnsavedChanges}
                        >
                          {t`Comment`}
                        </Menu.Item>
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
                        <Menu.Item
                          onClick={handleRemoveNode}
                          disabled={!canWrite}
                          leftSection={<Icon name="trash" size={14} />}
                        >
                          {t`Remove Chart`}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Flex>
              </Box>
            )}
            {series ? (
              <>
                <Box className={styles.questionResults}>
                  <Visualization
                    rawSeries={series}
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
                  display={(card?.display as CardDisplayType) || "table"}
                />
              </Box>
            )}
          </Box>
          {isModifyModalOpen &&
            card &&
            (isNativeQuestion ? (
              <NativeQueryModal
                card={card}
                isOpen={isModifyModalOpen}
                onClose={() => setIsModifyModalOpen(false)}
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
                card={card}
                isOpen={isModifyModalOpen}
                onClose={() => setIsModifyModalOpen(false)}
                onSave={(result) => {
                  updateAttributes({
                    id: result.card_id,
                    name: null,
                  });
                  setIsModifyModalOpen(false);
                }}
              />
            ))}
          {isReplaceModalOpen && (
            <QuestionPickerModal
              onChange={handleReplaceModalSelect}
              onClose={() => setIsReplaceModalOpen(false)}
            />
          )}
        </NodeViewWrapper>
      </>
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
