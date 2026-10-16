import { Fragment, useMemo } from "react";

import type { CommentExtraRenderer } from "metabase/comments/types";
import { getCommentThreads } from "metabase/comments/utils";
import { Box, Stack } from "metabase/ui";
import type { Comment } from "metabase-types/api/comments";

import { Discussion } from "../Discussion";

export interface DiscussionsProps {
  childTargetId: Comment["child_target_id"];
  comments: Comment[];
  targetId: Comment["target_id"];
  targetType: Comment["target_type"];
  useCommentUrl: (opts: { childTargetId: string | null }) => string;
  onHoverChange?: (childTargetId: string | undefined) => void;
  renderExtra?: CommentExtraRenderer;
}

export const Discussions = ({
  childTargetId,
  comments,
  targetId,
  targetType,
  useCommentUrl,
  onHoverChange,
  renderExtra,
}: DiscussionsProps) => {
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
              useCommentUrl={useCommentUrl}
              onHoverChange={onHoverChange}
              renderExtra={renderExtra}
            />
          </Box>
        </Fragment>
      ))}
    </Stack>
  );
};
