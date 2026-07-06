import { Fragment, useMemo } from "react";

import type {
  CommentExtraRenderer,
  CommentsLayout,
} from "metabase/comments/types";
import { getCommentThreads } from "metabase/comments/utils";
import { Box, Stack } from "metabase/ui";
import type { Comment } from "metabase-types/api/comments";

import { Discussion } from "../Discussion";

import S from "./Discussions.module.css";

export interface DiscussionProps {
  childTargetId: Comment["child_target_id"];
  comments: Comment[];
  targetId: Comment["target_id"];
  targetType: Comment["target_type"];
  onHoverChange?: (childTargetId: string | undefined) => void;
  renderExtra?: CommentExtraRenderer;
  layout?: CommentsLayout;
}

export const Discussions = ({
  childTargetId,
  comments,
  targetId,
  targetType,
  onHoverChange,
  renderExtra,
  layout = "sidesheet",
}: DiscussionProps) => {
  const threads = useMemo(
    () => getCommentThreads(comments, childTargetId),
    [comments, childTargetId],
  );

  const isSidebar = layout === "sidebar";

  return (
    <Stack pt={isSidebar ? 0 : "lg"} gap={0}>
      {threads.map((thread) => (
        <Fragment key={thread.id}>
          <Box
            className={isSidebar ? S.sidebarThread : undefined}
            pl={isSidebar ? 0 : "lg"}
            pr="lg"
            py={isSidebar ? "md" : undefined}
            pb={isSidebar ? "md" : "lg"}
          >
            <Discussion
              childTargetId={childTargetId}
              comments={thread.comments}
              targetId={targetId}
              targetType={targetType}
              onHoverChange={onHoverChange}
              renderExtra={renderExtra}
              layout={layout}
            />
          </Box>
        </Fragment>
      ))}
    </Stack>
  );
};
