import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Divider, Stack } from "metabase/ui";
import { useCreateCommentMutation } from "metabase-enterprise/api";
import { getCommentThreads } from "metabase-enterprise/comments/utils";
import type { Comment, DocumentContent } from "metabase-types/api";

import { CommentEditor } from "../CommentEditor";
import { Discussion } from "../Discussion";

export interface DiscussionProps {
  childTargetId: Comment["child_target_id"];
  comments: Comment[];
  targetId: Comment["target_id"];
  targetType: Comment["target_type"];
  autoOpenNewComment?: boolean;
}

/**
 * TODO: implement me
 * This component should not fetch any data (except version history) but it should use mutations.
 */
export const Discussions = ({
  childTargetId,
  comments,
  targetId,
  targetType,
  autoOpenNewComment = false,
}: DiscussionProps) => {
  const [, setNewComment] = useState<DocumentContent>();

  const [createComment] = useCreateCommentMutation();

  const threads = useMemo(() => getCommentThreads(comments), [comments]);

  const handleSubmit = (doc: DocumentContent) => {
    createComment({
      child_target_id: childTargetId,
      target_id: targetId,
      target_type: targetType,
      content: doc,
      parent_comment_id: null,
    });
  };

  const [isNewThreadStarted, setIsNewThreadStarted] =
    useState(autoOpenNewComment);

  // Auto-open new comment form if requested
  useEffect(() => {
    if (autoOpenNewComment) {
      setIsNewThreadStarted(true);
    }
  }, [autoOpenNewComment]);

  return (
    <Stack gap="0">
      {threads.map((thread) => (
        <>
          <Box key={thread.id} px="xl" mb="md">
            <Discussion
              childTargetId={childTargetId}
              comments={thread.comments}
              key={thread.id}
              targetId={targetId}
              targetType={targetType}
            />
          </Box>
          <Divider />
        </>
      ))}

      <Box p="xl">
        {!isNewThreadStarted && (
          <Button onClick={() => setIsNewThreadStarted(true)} variant="subtle">
            {t`New comment`}
          </Button>
        )}
        {isNewThreadStarted && (
          <CommentEditor
            isNewThread={true}
            autoFocus={autoOpenNewComment}
            onChange={(document) => setNewComment(document)}
            onSubmit={(doc) => {
              handleSubmit(doc);
              setIsNewThreadStarted(false);
            }}
          />
        )}
      </Box>
    </Stack>
  );
};
