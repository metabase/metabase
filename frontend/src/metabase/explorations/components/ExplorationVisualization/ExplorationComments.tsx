import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-use";
import { t } from "ttag";
import { noop } from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useListCommentsQuery,
  useToggleReactionMutation,
  useUpdateCommentMutation,
} from "metabase/api";
import { CommentEditor } from "metabase/comments/components";
import DiscussionS from "metabase/comments/components/Discussion/Discussion.module.css";
import { DiscussionActionPanel } from "metabase/comments/components/Discussion/DiscussionActionPanel";
import { DiscussionReactions } from "metabase/comments/components/Discussion/DiscussionReactions";
import { useCommentUrl } from "metabase/comments/hooks/use-comment-url";
import {
  formatCommentDate,
  getCommentNodeId,
  getListCommentsQuery,
} from "metabase/comments/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { trackExplorationCommentCreated } from "metabase/explorations/analytics";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { Avatar, Box, Group, Stack, Text, Title, Tooltip } from "metabase/ui";
import type {
  Comment,
  CommentContext,
  DocumentContent,
  ExplorationId,
} from "metabase-types/api";

import S from "./ExplorationComments.module.css";

export type CommentTagsRenderer = (comment: Comment) => ReactNode;

interface ExplorationCommentsProps {
  explorationId: ExplorationId;
  pageId: string;
  context?: CommentContext;
  disableAutoFocus?: boolean;
  onClose: () => void;
  renderCommentTags?: CommentTagsRenderer;
}

const TOOLTIP_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ExplorationComments({
  explorationId,
  pageId,
  context,
  disableAutoFocus = false,
  onClose,
  renderCommentTags,
}: ExplorationCommentsProps) {
  const {
    data: commentsData,
    isLoading,
    error,
  } = useListCommentsQuery(
    getListCommentsQuery({
      target_id: explorationId,
      target_type: "exploration",
    }),
  );
  const [createComment] = useCreateCommentMutation();
  const [sendToast] = useToast();

  const commentsStream = useMemo(
    () =>
      (commentsData?.comments ?? [])
        .filter(
          (comment) =>
            comment.child_target_id === pageId && !comment.deleted_at,
        )
        .toSorted(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        ),
    [commentsData, pageId],
  );

  const location = useLocation();
  const hash = location.hash?.substring(1);
  const hasHashTarget = commentsStream.some(
    (comment) => getCommentNodeId(comment) === hash,
  );

  const streamRef = useRef<HTMLDivElement>(null);
  const streamContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Anchor the stream on open: to the copied-link comment when the URL carries
    // one, otherwise to the latest activity. The comment bodies (tiptap editors)
    // mount asynchronously and keep growing the stream after the first paint, so
    // a one-shot scroll lands mid-stream — hold the anchor while the content is
    // still growing and let go on the first user scroll.

    const stream = streamRef.current;
    const content = streamContentRef.current;
    if (stream == null || content == null || commentsStream.length === 0) {
      return;
    }

    let lastAppliedScrollTop = -1;

    const applyAnchor = () => {
      if (hash && hasHashTarget) {
        document.getElementById(hash)?.scrollIntoView({ block: "center" });
      } else {
        stream.scrollTop = stream.scrollHeight;
      }
      lastAppliedScrollTop = stream.scrollTop;
    };

    const observer = new ResizeObserver(() => applyAnchor());

    const handleScroll = () => {
      if (Math.abs(stream.scrollTop - lastAppliedScrollTop) > 1) {
        observer.disconnect();
        stream.removeEventListener("scroll", handleScroll);
      }
    };

    applyAnchor();
    observer.observe(content);
    stream.addEventListener("scroll", handleScroll);

    return () => {
      observer.disconnect();
      stream.removeEventListener("scroll", handleScroll);
    };
  }, [commentsStream.length, hasHashTarget, hash]);

  useWindowEvent("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      onClose();
    }
  });

  const handleSubmit = async (doc: DocumentContent) => {
    const { error } = await createComment({
      child_target_id: pageId,
      target_id: explorationId,
      target_type: "exploration",
      content: doc,
      parent_comment_id: null,
      context,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "feedback-warning",
        message: t`Failed to send comment`,
      });
    } else {
      trackExplorationCommentCreated(explorationId, "sidebar");
    }
  };

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Stack gap={0} h="100%" data-testid="exploration-comments">
      <Box px="lg" pt="1.25rem" pb="sm">
        <Title order={3}>{t`Comments`}</Title>
      </Box>
      <Box ref={streamRef} flex={1} px="md" py="sm" className={S.stream}>
        <Stack ref={streamContentRef} gap="md">
          {commentsStream.map((comment) => (
            <ExplorationComment
              key={comment.id}
              comment={comment}
              pageId={pageId}
              renderCommentTags={renderCommentTags}
            />
          ))}
        </Stack>
      </Box>
      <Box px="lg" pb="lg" pt="xs" className={S.composer}>
        <CommentEditor
          autoFocus={commentsStream.length === 0 && !disableAutoFocus}
          data-testid="new-thread-editor"
          placeholder={t`Add a comment…`}
          onSubmit={handleSubmit}
        />
      </Box>
    </Stack>
  );
}

interface ExplorationCommentProps {
  comment: Comment;
  pageId: string;
  renderCommentTags?: CommentTagsRenderer;
}

function ExplorationComment({
  comment,
  pageId,
  renderCommentTags,
}: ExplorationCommentProps) {
  const currentUser = useSelector(getUser);
  const [isEditing, editingHandler] = useDisclosure(false);
  const [updateComment] = useUpdateCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();
  const [toggleReaction] = useToggleReactionMutation();
  const [sendToast] = useToast();
  const commentsUrl = useCommentUrl({ childTargetId: pageId });

  const location = useLocation();
  const commentNodeId = getCommentNodeId(comment);
  const isTarget = location.hash?.substring(1) === commentNodeId;
  const isCurrentUsersComment = currentUser?.id === comment.creator?.id;

  const handleEditSubmit = async (newContent: DocumentContent) => {
    editingHandler.close();
    const { error } = await updateComment({
      id: comment.id,
      content: newContent,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "feedback-warning",
        message: t`Failed to update comment`,
      });
    }
  };

  const handleDelete = async () => {
    const { error } = await deleteComment({
      id: comment.id,
      target_type: comment.target_type,
      target_id: comment.target_id,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "feedback-warning",
        message: t`Failed to delete comment`,
      });
    }
  };

  const handleCopyLink = () => {
    const url = `${commentsUrl}#${commentNodeId}`;
    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    sendToast({ icon: "check", message: t`Copied link` });
  };

  const handleToggleReaction = async (emoji: string, errorMessage: string) => {
    if (!currentUser) {
      return;
    }

    const { error } = await toggleReaction({
      id: comment.id,
      emoji,
      target_type: comment.target_type,
      target_id: comment.target_id,
      currentUser,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "feedback-warning",
        message: errorMessage,
      });
    }
  };

  const handleReaction = (_comment: Comment, emoji: string) =>
    handleToggleReaction(emoji, t`Failed to add reaction`);

  const handleReactionRemove = (_comment: Comment, emoji: string) =>
    handleToggleReaction(emoji, t`Failed to remove reaction`);

  const commentDate = new Date(comment.created_at);

  return (
    <Box
      // `commentRoot` scopes the action panel's reveal-on-hover rule;
      // `m={0}` neutralizes its stray margin at inline-style strength (class
      // order between css modules isn't guaranteed).
      className={cx(DiscussionS.commentRoot, S.comment, {
        [S.target]: isTarget,
      })}
      m={0}
      p="sm"
      id={commentNodeId}
      aria-current={isTarget ? "location" : undefined}
      data-testid="discussion-comment"
    >
      {!isEditing && (
        <DiscussionActionPanel
          comment={comment}
          onCopyLink={handleCopyLink}
          onDelete={isCurrentUsersComment ? handleDelete : undefined}
          onEdit={isCurrentUsersComment ? editingHandler.open : undefined}
          onReaction={handleReaction}
          onReopen={noop}
          onResolve={noop}
        />
      )}
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Avatar
          name={comment.creator?.common_name}
          size="1.5rem"
          mt="0.125rem"
        />
        <Stack gap="xs" flex={1} miw={0}>
          <Group gap="sm" align="center" wrap="nowrap">
            <Text fw={700} lh={1.3} truncate>
              {comment.creator?.common_name}
            </Text>
            <Tooltip label={TOOLTIP_DATE_FORMAT.format(commentDate)}>
              <Text
                size="xs"
                c="text-secondary"
                lh={1.1}
                style={{ whiteSpace: "nowrap" }}
              >
                {formatCommentDate(commentDate)}
              </Text>
            </Tooltip>
          </Group>
          {renderCommentTags && (
            <ErrorBoundary errorComponent={() => null}>
              <CommentTags renderTags={renderCommentTags} comment={comment} />
            </ErrorBoundary>
          )}
          <Box>
            <CommentEditor
              autoFocus
              data-testid="comment-editor"
              initialContent={comment.content}
              onSubmit={handleEditSubmit}
              readonly={!isEditing}
              onEscape={editingHandler.close}
            />
          </Box>
          {comment.reactions.length > 0 && (
            <DiscussionReactions
              comment={comment}
              onReaction={handleReaction}
              onReactionRemove={handleReactionRemove}
            />
          )}
        </Stack>
      </Group>
    </Box>
  );
}

// A component (rather than calling the renderer inline) so a throwing renderer
// is caught by the surrounding ErrorBoundary instead of crashing the comment.
function CommentTags({
  renderTags,
  comment,
}: {
  renderTags: CommentTagsRenderer;
  comment: Comment;
}) {
  return <>{renderTags(comment)}</>;
}
