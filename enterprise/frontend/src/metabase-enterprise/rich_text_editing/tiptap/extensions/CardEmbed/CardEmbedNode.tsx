import { autoUpdate, useFloating } from "@floating-ui/react";
import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMount, useUnmount } from "react-use";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
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
import { CommentsMenu } from "metabase-enterprise/documents/components/Editor/CommentsMenu";
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

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import CS from "../extensions.module.css";

import styles from "./CardEmbedNode.module.css";
import { ModifyQuestionModal } from "./ModifyQuestionModal";
import { NativeQueryModal } from "./NativeQueryModal";

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
        [side]: "-0.75rem",
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
    return [
      createProseMirrorPlugin("cardEmbed"),
      new Plugin({
        key: new PluginKey("simp"),
        props: {
          handleDOMEvents: {
            dragstart: (view, event) => {
              const { pos } = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });
              const node = view.state.doc.nodeAt(pos);

              view.draggingNode = node;
              return false;
            },
          },
        },
      }),
    ];
  },

  renderText({ node }) {
    return formatCardEmbed(node.attrs as CardEmbedAttributes);
  },

  addNodeView() {
    return ReactNodeViewRenderer(CardEmbedComponent);
  },
});

export const CardEmbedComponent = memo(
  ({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) => {
    const childTargetId = useSelector(getChildTargetId);
    const hoveredChildTargetId = useSelector(getHoveredChildTargetId);
    const document = useSelector(getCurrentDocument);
    const { data: commentsData } = useListCommentsQuery(
      getListCommentsQuery(document),
    );

    const comments = commentsData?.comments;
    const hasUnsavedChanges = useSelector(getHasUnsavedChanges);
    const [hovered, setHovered] = useState(false);
    const { _id } = node.attrs;
    const isOpen = childTargetId === _id;
    const isHovered = hoveredChildTargetId === _id;
    const threads = useMemo(
      () => getTargetChildCommentThreads(comments, _id),
      [comments, _id],
    );
    const { refs, floatingStyles } = useFloating({
      placement: "right-start",
      whileElementsMounted: autoUpdate,
      strategy: "fixed",
    });

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
    const isNativeQuestion = card?.dataset_query?.type === "native";

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
        if (draggingNode.type.name === "cardEmbed" && cardEmbedRef.current) {
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
          }, 300);
        }
      },
      [editor.view.draggingNode],
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
          ref={refs.setReference}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          data-drag-handle
          onDragOver={handleDragOver}
          onDrop={(_e) => {
            const target = node;
            const dropped = editor.view.draggingNode;
            const pos = getPos();

            if (!pos || target === dropped) {
              setDragState({ isDraggedOver: false, side: null });
              return;
            }

            const resolvedPos = editor.state.doc.resolve(pos);
            const { parent } = resolvedPos;
            const { side } = dragState;

            setDragState({ isDraggedOver: false, side: null });

            // Helper function to extract cardEmbed from resizeNode wrapper
            const extractCardEmbed = (node: any) => {
              if (node.type.name === "cardEmbed") {
                return node;
              }
              if (
                node.type.name === "resizeNode" &&
                node.content.childCount === 1
              ) {
                const child = node.content.child(0);
                if (child.type.name === "cardEmbed") {
                  return child;
                }
              }
              return null;
            };

            // Helper function to find position and parent of a node, handling resizeNode wrappers
            const findNodePositionAndParent = (searchNode: any) => {
              let foundPos: number | null = null;
              let foundParent: any = null;
              let foundNode: any = null;

              editor.state.doc.descendants((node, nodePos, nodeParent) => {
                if (node === searchNode) {
                  foundPos = nodePos;
                  foundParent = nodeParent;
                  foundNode = node;
                  return false;
                }
                // Also check if this node wraps the search node
                if (
                  node.type.name === "resizeNode" &&
                  node.content.childCount === 1
                ) {
                  const child = node.content.child(0);
                  if (child === searchNode) {
                    foundPos = nodePos;
                    foundParent = nodeParent;
                    foundNode = node; // Return the wrapper node for position tracking
                    return false;
                  }
                }
              });

              return {
                pos: foundPos,
                parent: foundParent,
                wrapperNode: foundNode,
              };
            };

            const droppedCardEmbed = extractCardEmbed(dropped);
            if (!droppedCardEmbed) {
              return; // Not a cardEmbed, ignore
            }

            const targetCardEmbed = extractCardEmbed(target);
            if (!targetCardEmbed) {
              return; // Target is not a cardEmbed, ignore
            }

            // Find the position of the dropped node (could be wrapped)
            const {
              pos: droppedPos,
              parent: droppedParent,
              wrapperNode: droppedWrapper,
            } = findNodePositionAndParent(dropped);

            if (droppedPos === null) {
              return;
            }

            // Check if both nodes are in the same FlexContainer
            if (
              parent.type.name === "flexContainer" &&
              droppedParent?.type.name === "flexContainer" &&
              parent === droppedParent
            ) {
              // Reorder within the same FlexContainer
              if (side) {
                const containerPos = resolvedPos.before();
                const targetIndex = resolvedPos.index();
                const droppedResolvedPos = editor.state.doc.resolve(droppedPos);
                const droppedIndex = droppedResolvedPos.index();

                let newIndex: number;
                if (side === "left") {
                  newIndex =
                    droppedIndex < targetIndex ? targetIndex - 1 : targetIndex;
                } else {
                  newIndex =
                    droppedIndex < targetIndex ? targetIndex : targetIndex + 1;
                }

                if (newIndex !== droppedIndex) {
                  // Create new FlexContainer with reordered children (unwrapped cardEmbeds)
                  const children = [];
                  for (let i = 0; i < parent.childCount; i++) {
                    if (i === droppedIndex) {
                      continue;
                    } // Skip the dragged node in original position
                    if (i === newIndex) {
                      children.push(droppedCardEmbed.copy()); // Insert unwrapped cardEmbed
                    }
                    const childNode = parent.child(i);
                    const childCardEmbed = extractCardEmbed(childNode);
                    children.push(
                      childCardEmbed ? childCardEmbed.copy() : childNode,
                    );
                  }
                  // If newIndex is at the end, add the dragged node
                  if (newIndex >= parent.childCount - 1) {
                    children.push(droppedCardEmbed.copy());
                  }

                  const newContainer =
                    editor.state.schema.nodes.flexContainer.create(
                      parent.attrs,
                      children,
                    );

                  editor.view.dispatch(
                    editor.state.tr.replaceWith(
                      containerPos,
                      containerPos + parent.nodeSize,
                      newContainer,
                    ),
                  );
                }
              }
            } else if (
              parent.type.name === "doc" ||
              parent.type.name === "resizeNode"
            ) {
              // Create new FlexContainer when dropping on a standalone CardEmbed
              const children =
                dragState.side === "left"
                  ? [droppedCardEmbed.copy(), targetCardEmbed.copy()]
                  : [targetCardEmbed.copy(), droppedCardEmbed.copy()];

              const flexContainer =
                editor.state.schema.nodes.flexContainer.create({}, children);

              // Wrap the flexContainer in a resizeNode
              const wrapper = editor.state.schema.nodes.resizeNode.create(
                { height: 442, minHeight: 250 },
                [flexContainer],
              );

              // Determine what to replace - if target is wrapped in resizeNode, replace the wrapper
              let replacePos = pos;
              let replaceSize = targetCardEmbed.nodeSize;
              if (parent.type.name === "resizeNode") {
                // Target is wrapped, replace the entire resizeNode
                replacePos = resolvedPos.before();
                replaceSize = parent.nodeSize;
              }

              editor.view.dispatch(
                editor.state.tr.replaceWith(
                  replacePos,
                  replacePos + replaceSize,
                  wrapper,
                ),
              );

              // Remove the dropped node from its original position
              // Use the wrapper node position if it exists, otherwise the cardEmbed position
              const nodeToRemove = droppedWrapper || dropped;
              editor.state.doc.descendants((node, nodePos) => {
                if (node === nodeToRemove) {
                  editor.view.dispatch(
                    editor.state.tr.delete(nodePos, nodePos + node.nodeSize),
                  );
                  return false;
                }
              });
            } else if (parent.type.name === "flexContainer") {
              // Dropping onto a FlexContainer - add to it
              const containerPos = resolvedPos.before();
              const targetIndex = resolvedPos.index();

              // Determine insertion index based on drop side
              const insertIndex =
                side === "left" ? targetIndex : targetIndex + 1;

              // Create new FlexContainer with the new child inserted
              const children = [];
              for (let i = 0; i < parent.childCount; i++) {
                if (i === insertIndex) {
                  children.push(droppedCardEmbed.copy());
                }
                const childNode = parent.child(i);
                const childCardEmbed = extractCardEmbed(childNode);
                children.push(
                  childCardEmbed ? childCardEmbed.copy() : childNode,
                );
              }
              // If inserting at the end
              if (insertIndex >= parent.childCount) {
                children.push(droppedCardEmbed.copy());
              }

              const newContainer =
                editor.state.schema.nodes.flexContainer.create(
                  parent.attrs,
                  children,
                );

              // Check if the FlexContainer is wrapped in a resizeNode
              const containerResolvedPos =
                editor.state.doc.resolve(containerPos);
              const containerParent = containerResolvedPos.parent;

              if (containerParent.type.name === "resizeNode") {
                // FlexContainer is already wrapped, just replace it
                editor.view.dispatch(
                  editor.state.tr.replaceWith(
                    containerPos,
                    containerPos + parent.nodeSize,
                    newContainer,
                  ),
                );
              } else {
                // FlexContainer is not wrapped, wrap it in resizeNode
                const wrapper = editor.state.schema.nodes.resizeNode.create(
                  { height: 442, minHeight: 250 },
                  [newContainer],
                );

                editor.view.dispatch(
                  editor.state.tr.replaceWith(
                    containerPos,
                    containerPos + parent.nodeSize,
                    wrapper,
                  ),
                );
              }

              // Remove the dropped node from its original position
              const nodeToRemove = droppedWrapper || dropped;
              editor.state.doc.descendants((node, nodePos) => {
                if (node === nodeToRemove) {
                  editor.view.dispatch(
                    editor.state.tr.delete(nodePos, nodePos + node.nodeSize),
                  );
                  return false;
                }
              });
            }
          }}
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
                          size="md"
                          color="text-dark"
                          fw={700}
                          c="pointer"
                          truncate="end"
                          onClick={handleTitleClick}
                        >
                          {displayName} ({id})
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
                  {!isEditingTitle && (
                    <Menu withinPortal position="bottom-end" data-hide-on-print>
                      <Menu.Target>
                        <Flex
                          component="button"
                          bg="transparent"
                          c="pointer"
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

        {document && (
          <CommentsMenu
            active={isOpen}
            disabled={hasUnsavedChanges}
            href={`/document/${document.id}/comments/${_id}`}
            ref={refs.setFloating}
            show={isOpen || hovered}
            threads={threads}
            style={floatingStyles}
          />
        )}
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
