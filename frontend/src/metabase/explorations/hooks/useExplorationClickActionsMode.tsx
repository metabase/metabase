import { type Dispatch, type SetStateAction, useMemo, useRef } from "react";
import { t } from "ttag";

import { useCreateCommentMutation } from "metabase/api/comment";
import { useExploreFurtherMutation } from "metabase/api/exploration";
import { useToast } from "metabase/common/hooks";
import {
  trackExplorationCommentCreated,
  trackExplorationExploreFurtherClicked,
} from "metabase/explorations/analytics";
import {
  buildCommentHighlightContext,
  canExploreFurther,
  getExploreFurtherFilters,
} from "metabase/explorations/components/ExplorationVisualization/utils";
import type {
  ClickAction,
  ClickActionPopoverProps,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";
import { isBrushClickObject } from "metabase/visualizations/types";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import type {
  DocumentContent,
  ExplorationId,
  ExplorationPageId,
  ExplorationQuery,
  ExplorationQueryId,
  ExplorationQueryType,
} from "metabase-types/api";

import { ExplorationCommentEditor } from "../components/ExplorationVisualization/ExplorationCommentEditor";
import type { CommentDrafts } from "../types";

interface UseExplorationClickActionsModeParams {
  explorationId?: ExplorationId;
  pageId?: ExplorationPageId;
  queryType?: ExplorationQueryType;
  commentDrafts: CommentDrafts;
  setCommentDrafts: Dispatch<SetStateAction<CommentDrafts>>;
  seriesQueryIds: ExplorationQueryId[];
  queriesById: Readonly<Record<ExplorationQueryId, ExplorationQuery>>;
}

export function useExplorationClickActionsMode({
  explorationId,
  pageId,
  queryType,
  commentDrafts,
  setCommentDrafts,
  seriesQueryIds,
  queriesById,
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
      actionsForClick: (
        clicked: ClickObject,
        settings?: ComputedVisualizationSettings,
      ) => {
        const actions: ClickAction[] = [];

        if (explorationId == null || pageId == null) {
          return actions;
        }

        if (canExploreFurther(clicked, queryType)) {
          const handleExploreFurther = async () => {
            const exploreFilters = getExploreFurtherFilters(clicked);
            sendToast({ icon: "bolt", message: t`Exploring further…` });
            const { error } = await exploreFurther({
              id: explorationId,
              page_id: pageId,
              explore_filters: exploreFilters,
            });
            if (error) {
              trackExplorationExploreFurtherClicked(explorationId, "failure");
              sendToast({
                icon: "warning_triangle_filled",
                iconColor: "warning",
                message: t`Couldn't start a new exploration`,
              });
            } else {
              trackExplorationExploreFurtherClicked(explorationId, "success");
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
            const highlightContext = buildCommentHighlightContext(
              clicked,
              seriesQueryIds,
              queriesById,
              settings,
            );
            const { error } = await createComment({
              target_id: explorationId,
              target_type: "exploration",
              child_target_id: String(pageId),
              parent_comment_id: null,
              content,
              context: highlightContext,
            });
            if (error) {
              sendToast({
                icon: "warning_triangle_filled",
                iconColor: "warning",
                message: t`Failed to add comment`,
              });
            } else {
              trackExplorationCommentCreated(explorationId, "chart_click");
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
    queryType,
    setCommentDrafts,
    exploreFurther,
    createComment,
    sendToast,
    seriesQueryIds,
    queriesById,
  ]);

  return mode;
}
