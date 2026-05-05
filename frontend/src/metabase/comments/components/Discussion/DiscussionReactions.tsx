import { Flex } from "metabase/ui";
import type { Comment } from "metabase-types/api";

import { Reaction } from "./Reaction";

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
