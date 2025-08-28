import { useState } from "react";

import { Box, Stack, Timeline } from "metabase/ui";
import { useCreateCommentMutation } from "metabase-enterprise/api";
import type { Comment, DocumentContent } from "metabase-types/api";

import { CommentEditor } from "../CommentEditor";

import S from "./Discussion.module.css";
import { DiscussionComment } from "./DiscussionComment";

export interface DiscussionProps {
  childTargetId: Comment["child_target_id"];
  comments: Comment[];
  targetId: Comment["target_id"];
  targetType: Comment["target_type"];
}

/**
 * TODO: implement me
 * This component should not fetch any data (except version history) but it should use mutations.
 */
export const Discussion = ({
  childTargetId,
  comments,
  targetId,
  targetType,
}: DiscussionProps) => {
  const [, setNewComment] = useState<DocumentContent>();

  const [createComment] = useCreateCommentMutation();

  const handleSubmit = (doc: DocumentContent) => {
    createComment({
      child_target_id: childTargetId,
      target_id: targetId,
      target_type: targetType,
      content: doc,
      parent_comment_id: null, // TODO: implement me
    });
  };

  return (
    <Stack>
      <Timeline lineWidth={1} className={S.discussionRoot}>
        {comments.map((comment, index) => (
          <DiscussionComment
            key={comment.id}
            comment={comment}
            actionPanelVariant={index === 0 ? "discussion" : "comment"}
          />
        ))}
      </Timeline>

      <Box>
        <CommentEditor
          onChange={(document) => setNewComment(document)}
          onSubmit={handleSubmit}
        />
      </Box>
    </Stack>
  );
};
