import { Fragment, useMemo } from "react";

import type { CommentExtraRenderer } from "metabase/comments/types";
import { getCommentThreads } from "metabase/comments/utils";
import { Box, Stack } from "metabase/ui";
import type { Comment } from "metabase-types/api/comments";

import { Discussion } from "../Discussion";

export interface DiscussionProps {
  childTargetId: Comment["child_target_id"];
  comments: Comment[];
  targetId: Comment["target_id"];
  targetType: Comment["target_type"];
  onHoverChange?: (childTargetId: string | undefined) => void;
  renderExtra?: CommentExtraRenderer;
}

export const Discussions = ({
  childTargetId,
  comments,
  targetId,
  targetType,
  onHoverChange,
  renderExtra,
}: DiscussionProps) => {
  const threads = useMemo(
    () => getCommentThreads(comments, childTargetId),
    [comments, childTargetId],
  );

  return (
    <Stack pt="xl" gap={0}>
      {threads.map((thread) => (
        <Fragment key={thread.id}>
          <Box px="xl" pb="xl">
            <Discussion
              childTargetId={childTargetId}
              comments={thread.comments}
              targetId={targetId}
              targetType={targetType}
              onHoverChange={onHoverChange}
              renderExtra={renderExtra}
            />
          </Box>
        </Fragment>
      ))}
    </Stack>
  );
};
