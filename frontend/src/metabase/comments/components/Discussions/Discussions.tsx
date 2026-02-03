import { Fragment, useMemo } from "react";

import { getCommentThreads } from "metabase/comments/utils";
import { Box, Stack } from "metabase/ui";
import type { Comment } from "metabase-types/api/comments";

import { Discussion } from "../Discussion";

export interface DiscussionProps {
  childTargetId: Comment["child_target_id"];
  comments: Comment[];
  targetId: Comment["target_id"];
  targetType: Comment["target_type"];
  enableHoverHighlight?: boolean;
}

export const Discussions = ({
  childTargetId,
  comments,
  targetId,
  targetType,
  enableHoverHighlight = false,
}: DiscussionProps) => {
  const threads = useMemo(
    () => getCommentThreads(comments, childTargetId),
    [comments, childTargetId],
  );

  return (
    <Stack pt="lg" gap={0}>
      {threads.map((thread) => (
        <Fragment key={thread.id}>
          <Box px="lg" pb="lg">
            <Discussion
              childTargetId={childTargetId}
              comments={thread.comments}
              targetId={targetId}
              targetType={targetType}
              enableHoverHighlight={enableHoverHighlight}
            />
          </Box>
        </Fragment>
      ))}
    </Stack>
  );
};
