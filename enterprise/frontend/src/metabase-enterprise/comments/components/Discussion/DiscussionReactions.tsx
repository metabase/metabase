import cx from "classnames";
import { useCallback, useMemo } from "react";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { Flex, Text, Tooltip } from "metabase/ui";
import type { Comment, CommentReaction } from "metabase-types/api";

import S from "./Discussion.module.css";

type DiscussionReactionsProps = {
  comment: Comment;
  onReactionRemove?: (comment: Comment, emoji: string) => void;
  onReaction?: (comment: Comment, emoji: string) => void;
};

export function DiscussionReactions({
  comment,
  onReactionRemove,
  onReaction,
}: DiscussionReactionsProps) {
  if (comment.reactions.length === 0) {
    return null;
  }

  return (
    <Flex p="0" mt="sm" gap="sm" wrap="wrap" data-testid="discussion-reactions">
      {comment.reactions.map((reaction) => (
        <Reaction
          key={reaction.emoji}
          reaction={reaction}
          onReaction={(emoji) => onReaction?.(comment, emoji)}
          onReactionRemove={(emoji) => onReactionRemove?.(comment, emoji)}
        />
      ))}
    </Flex>
  );
}

function Reaction({
  reaction,
  onReaction,
  onReactionRemove,
}: {
  reaction: CommentReaction;
  onReaction: (emoji: string) => void;
  onReactionRemove: (emoji: string) => void;
}) {
  const currentUser = useSelector(getCurrentUser);
  const isCurrentUserReaction = useMemo(
    () => reaction.users.some((user) => user.id === currentUser.id),
    [reaction.users, currentUser.id],
  );

  const reactionLabel = useMemo(
    () => reaction.users.map((user) => user.name).join(", "),
    [reaction.users],
  );

  const handleReactionClick = useCallback(
    () =>
      isCurrentUserReaction
        ? onReactionRemove?.(reaction.emoji)
        : onReaction?.(reaction.emoji),
    [isCurrentUserReaction, onReactionRemove, onReaction, reaction],
  );

  return (
    <Tooltip label={reactionLabel}>
      <Flex
        align="center"
        gap="xs"
        fz="sm"
        fw={700}
        className={cx(S.reaction, {
          [S.currentUserReaction]: isCurrentUserReaction,
        })}
        onClick={handleReactionClick}
      >
        <Text component="span" fz="1rem">
          {reaction.emoji}
        </Text>
        {reaction.count}
      </Flex>
    </Tooltip>
  );
}
