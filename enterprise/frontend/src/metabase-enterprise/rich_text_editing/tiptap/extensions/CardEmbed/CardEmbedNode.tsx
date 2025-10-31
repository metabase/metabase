import { Node, mergeAttributes } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { ForwardRefLink } from "metabase/common/components/Link";
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import { canDownloadResults } from "metabase/dashboard/components/DashCard/DashCardMenu/utils";
import { isWithinIframe } from "metabase/lib/dom";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Icon, Loader, Menu, Text, TextInput } from "metabase/ui";
import { DocumentMode } from "metabase/visualizations/click-actions/modes/DocumentMode";
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
import { usePublicDocumentContext } from "metabase-enterprise/public/contexts/PublicDocumentContext";
import { usePublicDocumentCardData } from "metabase-enterprise/public/hooks/use-public-document-card-data";
import { useDndHelpers } from "metabase-enterprise/rich_text_editing/tiptap/extensions/CardEmbed/use-dnd-helpers.hook";
import { useUpdateCardOperations } from "metabase-enterprise/rich_text_editing/tiptap/extensions/CardEmbed/use-update-card-operations.hook";
import { getEmbedIndex } from "metabase-enterprise/rich_text_editing/tiptap/extensions/CardEmbed/utils";
import Question from "metabase-lib/v1/Question";
import { getUrl } from "metabase-lib/v1/urls";
import type { CardDisplayType, Dataset } from "metabase-types/api";

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
import { PublicDocumentCardMenu } from "./PublicDocumentCardMenu";

interface CardEmbedMenuContext {
  canWrite: boolean;
  dataset: Dataset | undefined;
  question: Question | undefined;
  isNativeQuestion: boolean | undefined;
  commentsPath: string;
  hasUnsavedChanges: boolean;
  unresolvedCommentsCount: number;
}

interface CardEmbedMenuActions {
  handleDownload: (opts: {
    type: string;
    enableFormatting: boolean;
    enablePivot: boolean;
  }) => void;
  handleEditVisualizationSettings: () => void;
  setIsModifyModalOpen: (open: boolean) => void;
  handleReplaceQuestion: () => void;
  handleRemoveNode: () => void;
}

interface CardEmbedMenuState {
  menuView: string | null;
  setMenuView: (view: string | null) => void;
  isDownloadingData: boolean;
}

type CardEmbedMenuDropdownProps = CardEmbedMenuContext &
  CardEmbedMenuActions &
  CardEmbedMenuState;

const CardEmbedMenuDropdown = ({
  // Context
  canWrite,
  dataset,
  question,
  isNativeQuestion,
  commentsPath,
  hasUnsavedChanges,
  unresolvedCommentsCount,
  // Actions
  handleDownload,
  handleEditVisualizationSettings,
  setIsModifyModalOpen,
  handleReplaceQuestion,
  handleRemoveNode,
  // State
  menuView,
  setMenuView,
  isDownloadingData,
}: CardEmbedMenuDropdownProps) => {
  if (menuView === "downloads" && question && dataset) {
    return (
      <QuestionDownloadWidget
        question={question}
        result={dataset}
        onDownload={(opts) => {
          setMenuView(null);
          handleDownload(opts);
        }}
      />
    );
  }

  return (
    <>
      {!isWithinIframe() && canWrite && (
        <Menu.Item
          leftSection={<Icon name="add_comment" size={14} />}
          component={ForwardRefLink}
          to={
            unresolvedCommentsCount > 0
              ? commentsPath
              : `${commentsPath}?new=true`
          }
          onClick={(e) => {
            if (!commentsPath || hasUnsavedChanges) {
              e.preventDefault();
            }
          }}
          disabled={!commentsPath || hasUnsavedChanges}
        >
          {t`Comment`}
        </Menu.Item>
      )}
      <Menu.Item
        onClick={handleEditVisualizationSettings}
        leftSection={<Icon name="palette" size={14} />}
        disabled={!canWrite}
      >
        {t`Edit Visualization`}
      </Menu.Item>
      <Menu.Item
        onClick={() => setIsModifyModalOpen(true)}
        leftSection={
          <Icon name={isNativeQuestion ? "sql" : "notebook"} size={14} />
        }
        disabled={!canWrite}
      >
        {t`Edit Query`}
      </Menu.Item>
      <Menu.Item
        onClick={handleReplaceQuestion}
        leftSection={<Icon name="refresh" size={14} />}
        disabled={!canWrite}
      >
        {t`Replace`}
      </Menu.Item>
      {canDownloadResults(dataset) && (
        <Menu.Item
          leftSection={<Icon name="download" aria-hidden />}
          aria-label={isDownloadingData ? t`Downloading…` : t`Download results`}
          disabled={isDownloadingData}
          closeMenuOnClick={false}
          onClick={() => {
            setMenuView("downloads");
          }}
        >
          {isDownloadingData ? t`Downloading…` : t`Download results`}
        </Menu.Item>
      )}
      <Menu.Item
        onClick={handleRemoveNode}
        leftSection={<Icon name="trash" size={14} />}
        disabled={!canWrite}
      >
        {t`Remove Chart`}
      </Menu.Item>
    </>
  );
};

export const DROP_ZONE_COLOR = "var(--mb-color-brand)";

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
        backgroundColor: isOver ? DROP_ZONE_COLOR : "transparent",
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
    const { publicDocumentUuid } = usePublicDocumentContext();
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

    const {
      isBeingDragged,
      dragState,
      setDragState,
      handleDragOver,
      cardEmbedRef,
    } = useDndHelpers({ editor, node, getPos });

    const embedIndex = getEmbedIndex(editor, getPos);

    // Use public hook when viewing a public document, otherwise use regular hook
    const isPublicDocument = Boolean(publicDocumentUuid);
    const regularCardData = useCardData({ id });
    const publicCardData = usePublicDocumentCardData({
      cardId: id,
      documentUuid: publicDocumentUuid || "",
    });

    const { card, dataset, isLoading, series, error } = isPublicDocument
      ? publicCardData
      : regularCardData;

    const metadata = useSelector(getMetadata);
    const datasetError = dataset && getDatasetError(dataset);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(name || "");
    const titleInputRef = useRef<HTMLInputElement>(null);
    const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
    const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
    const [menuView, setMenuView] = useState<string | null>(null);

    const displayName = name || card?.name;
    const question = useMemo(
      () => (card != null ? new Question(card, metadata) : undefined),
      [card, metadata],
    );
    const isNativeQuestion = question?.isNative();

    const [{ loading: isDownloadingData }, handleDownload] = useDownloadData({
      question: question!,
      result: dataset!,
      documentId: document?.id,
    });

    const {
      handleChangeCardAndRun,
      handleUpdateQuestion,
      handleUpdateVisualizationSettings,
    } = useUpdateCardOperations({
      document,
      regularCardData,
      question,
      editor,
      embedIndex,
      cardId: id,
    });

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
                          c={isPublicDocument ? undefined : "pointer"}
                          truncate="end"
                          onClick={
                            isPublicDocument ? undefined : handleTitleClick
                          }
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
                  {!isEditingTitle &&
                    (isPublicDocument && dataset && !canWrite ? (
                      <PublicDocumentCardMenu card={card} dataset={dataset} />
                    ) : !isPublicDocument && (canWrite || dataset) ? (
                      <Menu
                        withinPortal
                        position="bottom-end"
                        data-hide-on-print
                        opened={menuView !== null ? true : undefined}
                        onClose={() => setMenuView(null)}
                      >
                        <Menu.Target>
                          <Flex
                            component="button"
                            p="0.25rem"
                            align="center"
                            justify="center"
                            className={styles.menuButton}
                            onClick={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          >
                            <Icon
                              name="ellipsis"
                              size={16}
                              color="var(--mb-color-text-medium)"
                            />
                          </Flex>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <CardEmbedMenuDropdown
                            menuView={menuView}
                            setMenuView={setMenuView}
                            canWrite={canWrite}
                            dataset={dataset}
                            question={question}
                            isNativeQuestion={isNativeQuestion}
                            isDownloadingData={isDownloadingData}
                            handleDownload={handleDownload}
                            handleEditVisualizationSettings={
                              handleEditVisualizationSettings
                            }
                            setIsModifyModalOpen={setIsModifyModalOpen}
                            handleReplaceQuestion={handleReplaceQuestion}
                            handleRemoveNode={handleRemoveNode}
                            commentsPath={commentsPath}
                            hasUnsavedChanges={hasUnsavedChanges}
                            unresolvedCommentsCount={unresolvedCommentsCount}
                          />
                        </Menu.Dropdown>
                      </Menu>
                    ) : null)}
                </Flex>
              </Box>
            )}
            {series ? (
              <>
                <Box className={styles.questionResults}>
                  <Visualization
                    rawSeries={series}
                    metadata={metadata}
                    mode={DocumentMode}
                    onChangeCardAndRun={
                      isPublicDocument ? undefined : handleChangeCardAndRun
                    }
                    onUpdateQuestion={
                      isPublicDocument ? undefined : handleUpdateQuestion
                    }
                    onUpdateVisualizationSettings={
                      isPublicDocument
                        ? undefined
                        : handleUpdateVisualizationSettings
                    }
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
