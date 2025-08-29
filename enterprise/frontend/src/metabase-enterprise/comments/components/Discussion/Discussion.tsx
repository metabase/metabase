import { useEffect, useState } from "react";
import { match } from "ts-pattern";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { Stack, Timeline, rem } from "metabase/ui";
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useUpdateCommentMutation,
} from "metabase-enterprise/api";
import type {
  Comment,
  CommentEntityType,
  DocumentContent,
  EntityId,
} from "metabase-types/api";

import { CommentEditor } from "../CommentEditor";

import S from "./Discussion.module.css";
import { DiscussionAvatar } from "./DiscussionAvatar";
import { DiscussionComment } from "./DiscussionComment";

export interface DiscussionProps {
  childTargetId: EntityId | null;
  comments: Comment[];
  targetId: EntityId;
  targetType: CommentEntityType;
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
  const currentUser = useSelector(getCurrentUser);
  const [, setNewComment] = useState<DocumentContent>();
  const [linkCopied, setLinkCopied] = useState(false);
  const parentCommentId = comments[0].id;

  const [createComment] = useCreateCommentMutation();
  const [updateComment] = useUpdateCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();

  const handleSubmit = (doc: DocumentContent) => {
    createComment({
      child_target_id: childTargetId,
      target_id: targetId,
      target_type: targetType,
      content: doc,
      parent_comment_id: parentCommentId,
    });
  };

  const handleDeleteComment = (comment: Comment) => {
    deleteComment(comment.id);
  };

  const handleResolveComment = (comment: Comment) => {
    updateComment({ id: comment.id, is_resolved: true });
  };

  const handleReopenComment = (comment: Comment) => {
    updateComment({ id: comment.id, is_resolved: false });
  };

  const handleEditComment = (comment: Comment, newContent: DocumentContent) => {
    updateComment({ id: comment.id, content: newContent });
  };

  const handleCopyLink = () => {
    const url = getUrl({ childTargetId, targetId, targetType });

    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    setLinkCopied(true);
  };

  useEffect(() => {
    if (linkCopied) {
      const timeout = setTimeout(() => setLinkCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [linkCopied]);

  return (
    <Stack>
      <Timeline bulletSize={rem(24)} lineWidth={1} className={S.discussionRoot}>
        {comments.map((comment, index) => (
          <DiscussionComment
            key={comment.id}
            comment={comment}
            actionPanelVariant={index === 0 ? "discussion" : "comment"}
            onDelete={handleDeleteComment}
            onResolve={handleResolveComment}
            onReopen={handleReopenComment}
            onEdit={handleEditComment}
            onCopyLink={handleCopyLink}
          />
        ))}
        <Timeline.Item
          className={S.commentRoot}
          bullet={<DiscussionAvatar user={currentUser} />}
        >
          <CommentEditor
            active={false}
            onChange={(document) => setNewComment(document)}
            onSubmit={handleSubmit}
          />
        </Timeline.Item>
      </Timeline>
    </Stack>
  );
};

function getUrl({
  childTargetId,
  targetId,
  targetType,
}: {
  childTargetId: EntityId | null;
  targetId: EntityId;
  targetType: CommentEntityType;
}) {
  return match(targetType)
    .with("document", () => {
      return `/document/${targetId}/comments/${childTargetId}`;
    })
    .exhaustive();
}
