import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import cx from "classnames";
import {
  type ComponentPropsWithoutRef,
  useEffect,
  useMemo,
  useRef,
} from "react";
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
import {
  formatCommentDate,
  getCommentNodeId,
  getListCommentsQuery,
} from "metabase/comments/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { getUser } from "metabase/current-user";
import { trackExplorationCommentCreated } from "metabase/explorations/analytics";
import { setHighlightedComment } from "metabase/explorations/explorations.slice";
import {
  type ExplorationCommentView,
  useExplorationCommentUrl,
} from "metabase/explorations/hooks/useExplorationCommentUrl";
import { useDispatch, useSelector } from "metabase/redux";
import {
  ActionIcon,
  Avatar,
  Box,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type {
  Comment,
  CommentContext,
  DocumentContent,
  ExplorationId,
  Timeline,
  TimelineId,
} from "metabase-types/api";

import S from "./ExplorationComments.module.css";

interface ExplorationCommentsProps {
  explorationId: ExplorationId;
  pageId: string;
  view: ExplorationCommentView;
  context?: CommentContext;
  disableAutoFocus?: boolean;
  onClose: () => void;
  timelines?: Timeline[];
  onSelectTimelineId?: (timelineId: TimelineId | null) => void;
}

const TOOLTIP_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ExplorationComments({
  explorationId,
  pageId,
  view,
  context,
  disableAutoFocus = false,
  onClose,
  timelines = [],
  onSelectTimelineId,
}: ExplorationCommentsProps) {
  const dispatch = useDispatch();
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

  useEffect(() => {
    return () => {
      dispatch(setHighlightedComment(null));
    };
  }, [dispatch, pageId]);

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
      <Group
        px="xl"
        pt="1.25rem"
        pb="sm"
        justify="space-between"
        align="center"
      >
        <Title order={3}>{t`Comments`}</Title>
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <Icon name="close" c="icon-primary" />
        </ActionIcon>
      </Group>
      <Box ref={streamRef} flex={1} px="lg" py="sm" className={S.stream}>
        <Stack ref={streamContentRef} gap="lg">
          {commentsStream.map((comment) => (
            <ExplorationComment
              key={comment.id}
              comment={comment}
              pageId={pageId}
              view={view}
              timelines={timelines}
              onSelectTimelineId={onSelectTimelineId}
            />
          ))}
        </Stack>
      </Box>
      <Box px="xl" pb="xl" pt="xxs" className={S.composer}>
        <CommentEditor
          autoFocus={!disableAutoFocus}
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
  view: ExplorationCommentView;
  timelines: Timeline[];
  onSelectTimelineId?: (timelineId: TimelineId | null) => void;
}

function ExplorationComment({
  comment,
  pageId,
  view,
  timelines,
  onSelectTimelineId,
}: ExplorationCommentProps) {
  const currentUser = useSelector(getUser);
  const [isEditing, editingHandler] = useDisclosure(false);
  const [updateComment] = useUpdateCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();
  const [toggleReaction] = useToggleReactionMutation();
  const [sendToast] = useToast();
  const commentsUrl = useExplorationCommentUrl({
    childTargetId: pageId,
    view,
  });

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
        <Stack gap="xxs" flex={1} miw={0}>
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
          <ErrorBoundary errorComponent={() => null}>
            <CommentTags
              comment={comment}
              pageId={pageId}
              timelines={timelines}
              onSelectTimelineId={onSelectTimelineId}
            />
          </ErrorBoundary>
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

function CommentTags({
  comment,
  pageId,
  timelines,
  onSelectTimelineId,
}: {
  comment: Comment;
  pageId: string;
  timelines: Timeline[];
  onSelectTimelineId?: (timelineId: TimelineId | null) => void;
}) {
  const dispatch = useDispatch();
  const context = comment.context;

  // `highlight_label` is formatted by the client that created the comment, since only it knows
  // the chart's column settings; the server stores it verbatim and gates it with the rest of the
  // context, so an absent context here means the viewer is not allowed the values it carried.
  const highlightLabel = context?.highlight_label;
  const highlighted = context?.highlighted;
  const explorationQueryIds = context?.exploration_query_ids ?? [];
  const timelineId = context?.timeline_id ?? undefined;
  const timeline =
    timelineId != null
      ? timelines.find((entry) => entry.id === timelineId)
      : undefined;

  if (!highlightLabel && !timeline) {
    return null;
  }

  return (
    <Group gap="xxs" wrap="wrap">
      <Icon
        name="corner_up_right"
        size={12}
        c="text-secondary"
        className={S.commentTagArrow}
        aria-hidden
      />
      {highlightLabel && (
        <CommentBadge
          label={highlightLabel}
          buttonProps={{
            onMouseEnter: () => {
              if (highlighted && explorationQueryIds.length > 0) {
                dispatch(
                  setHighlightedComment({
                    childTargetId: pageId,
                    highlighted,
                    explorationQueryIds,
                  }),
                );
              }
            },
            onMouseLeave: () => dispatch(setHighlightedComment(null)),
          }}
        />
      )}
      {timeline &&
        (onSelectTimelineId != null ? (
          <CommentBadge
            label={timeline.name}
            buttonProps={{
              onClick: () => {
                onSelectTimelineId(timelineId ?? null);
              },
            }}
          />
        ) : (
          <CommentBadge label={timeline.name} />
        ))}
    </Group>
  );
}

interface CommentBadgeProps {
  label: string;
  buttonProps?: ComponentPropsWithoutRef<typeof UnstyledButton>;
}

function CommentBadge({ label, buttonProps }: CommentBadgeProps) {
  if (buttonProps == null) {
    return (
      <Text
        bdrs="sm"
        py="xxs"
        px="sm"
        fz="sm"
        c="text-primary"
        className={S.commentBadgeLabel}
        component="span"
        style={{ lineHeight: "normal" }}
      >
        {label}
      </Text>
    );
  }

  return (
    <UnstyledButton
      bdrs="sm"
      py="xxs"
      px="sm"
      fz="sm"
      c="text-primary"
      className={S.commentBadge}
      {...buttonProps}
    >
      {label}
    </UnstyledButton>
  );
}
