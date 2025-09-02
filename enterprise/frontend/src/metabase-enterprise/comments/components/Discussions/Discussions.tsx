import { Fragment, useMemo } from "react";

import { Box, Divider, Stack } from "metabase/ui";
import { getCommentThreads } from "metabase-enterprise/comments/utils";
import type { Comment } from "metabase-types/api";

import { Discussion } from "../Discussion";

export interface DiscussionProps {
  childTargetId: Comment["child_target_id"];
  comments: Comment[];
  targetId: Comment["target_id"];
  targetType: Comment["target_type"];
}

export const Discussions = ({
  childTargetId,
  comments,
  targetId,
  targetType,
}: DiscussionProps) => {
  const threads = useMemo(() => getCommentThreads(comments), [comments]);

  return (
    <Stack gap={0}>
      {threads.map((thread) => (
        <Fragment key={thread.id}>
          <Box px="xl" py="md">
            <Discussion
              childTargetId={childTargetId}
              comments={thread.comments}
              targetId={targetId}
              targetType={targetType}
            />
          </Box>

          <Divider />
        </Fragment>
      ))}
    </Stack>
  );
};
