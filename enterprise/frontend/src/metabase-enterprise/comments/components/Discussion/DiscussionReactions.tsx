import { useCallback } from "react";

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
  const currentUser = useSelector(getCurrentUser);
  const handleReactionClick = useCallback(
    (reaction: CommentReaction) => {
      const isCurrentUserReaction = reaction.users.some(
        (user) => user.id === currentUser.id,
      );

      if (isCurrentUserReaction) {
        onReactionRemove?.(comment, reaction.emoji);
      } else {
        onReaction?.(comment, reaction.emoji);
      }
    },
    [comment, currentUser.id, onReactionRemove, onReaction],
  );

  if (comment.reactions.length === 0) {
    return null;
  }

  return (
    <Flex p="0" mt="sm" gap="sm" wrap="wrap">
      {comment.reactions.map((reaction) => (
        <Tooltip
          key={reaction.emoji}
          label={reaction.users.map((user) => user.name).join(", ")}
        >
          <Flex
            component="button"
            type="button"
            align="center"
            gap="xs"
            className={S.reaction}
            onClick={() => handleReactionClick(reaction)}
          >
            <Text component="span" fz="1rem">
              {reaction.emoji}
            </Text>
            <Text component="span" fz="sm" fw={700}>
              {reaction.count}
            </Text>
          </Flex>
        </Tooltip>
      ))}
    </Flex>
  );
}
