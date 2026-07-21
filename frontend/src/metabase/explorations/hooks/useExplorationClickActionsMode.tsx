import { type Dispatch, type SetStateAction, useMemo, useRef } from "react";
import { t } from "ttag";

import { useCreateCommentMutation } from "metabase/api/comment";
import { useExploreFurtherMutation } from "metabase/api/exploration";
import { useToast } from "metabase/common/hooks";
import type {
  ClickAction,
  ClickActionPopoverProps,
  ClickActionsMode,
  ClickObject,
  HighlightedObject,
} from "metabase/visualizations/types";
import { isBrushClickObject } from "metabase/visualizations/types";
import type {
  DocumentContent,
  ExplorationBlockNodeType,
  ExplorationId,
  ExplorationPageId,
  ExplorationQueryType,
} from "metabase-types/api";

import { ExplorationCommentEditor } from "../components/ExplorationVisualization/ExplorationCommentEditor";
import {
  canExploreFurther,
  getExploreFurtherFilters,
} from "../components/ExplorationVisualization/utils";
import type { CommentDrafts } from "../types";

interface UseExplorationClickActionsModeParams {
  explorationId: ExplorationId;
  pageId: ExplorationPageId;
  blockType: ExplorationBlockNodeType;
  queryType: ExplorationQueryType;
  commentDrafts: CommentDrafts;
  setCommentDrafts: Dispatch<SetStateAction<CommentDrafts>>;
}

export function useExplorationClickActionsMode({
  explorationId,
  pageId,
  blockType,
  queryType,
  commentDrafts,
  setCommentDrafts,
}: UseExplorationClickActionsModeParams): ClickActionsMode {
  const [exploreFurther] = useExploreFurtherMutation();
  const [createComment] = useCreateCommentMutation();
  const [sendToast] = useToast();

  // mode should be stable even when commentDrafts changes, otherwise Visualization rerenders on every keystroke
  // which can cause the element the editor is anchored on to be removed, causing the editor to move to the top left of the screen
  const commentDraftsRef = useRef(commentDrafts);
  commentDraftsRef.current = commentDrafts;

  const mode = useMemo(() => {
    return {
      actionsForClick: (clicked: ClickObject) => {
        const actions: ClickAction[] = [];

        if (canExploreFurther(clicked, blockType, queryType)) {
          const handleExploreFurther = async () => {
            const exploreFilters = getExploreFurtherFilters(clicked);
            sendToast({ icon: "bolt", message: t`Exploring further…` });
            const { error } = await exploreFurther({
              id: explorationId,
              page_id: pageId,
              explore_filters: exploreFilters,
            });
            if (error) {
              sendToast({
                icon: "warning_triangle_filled",
                iconColor: "warning",
                message: t`Couldn't start a new exploration`,
              });
            }
          };

          actions.push({
            name: "explore-further",
            section: "custom",
            type: "custom",
            title: t`Explore further`,
            buttonType: "horizontal",
            icon: "breakout",
            onClick: ({ closePopover }) => {
              handleExploreFurther();
              closePopover();
            },
          });
        }

        if (!isBrushClickObject(clicked)) {
          const handleAddComment = async (
            content: DocumentContent,
            onClose: () => void,
          ) => {
            const highlighted: HighlightedObject = {
              cardId: clicked.cardId,
              columnName: clicked.column?.name,
              dimensions: clicked.dimensions?.map((d) => ({
                value: d.value,
                columnName: d.column.name,
              })),
            };
            const { error } = await createComment({
              target_id: explorationId,
              target_type: "exploration",
              child_target_id: String(pageId),
              parent_comment_id: null,
              content,
              context: {
                highlighted,
              },
            });
            if (error) {
              sendToast({
                icon: "warning_triangle_filled",
                iconColor: "warning",
                message: t`Failed to add comment`,
              });
            } else {
              onClose();
            }
          };

          const CommentEditor = ({ onClose }: ClickActionPopoverProps) => {
            return (
              <ExplorationCommentEditor
                commentDrafts={commentDraftsRef.current}
                setCommentDrafts={setCommentDrafts}
                pageId={String(pageId)}
                onAddComment={(content) => handleAddComment(content, onClose)}
                placeholder={t`Comment on this…`}
              />
            );
          };

          actions.push({
            name: "add-comment",
            section: "custom",
            title: t`Add comment`,
            buttonType: "horizontal",
            icon: "add_comment",
            popover: CommentEditor,
          });
        }

        return actions;
      },
    };
  }, [
    explorationId,
    pageId,
    blockType,
    queryType,
    setCommentDrafts,
    exploreFurther,
    createComment,
    sendToast,
  ]);

  return mode;
}
