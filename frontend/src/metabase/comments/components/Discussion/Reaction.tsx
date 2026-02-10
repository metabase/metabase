import cx from "classnames";
import { useCallback, useMemo } from "react";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { Flex, Text, Tooltip } from "metabase/ui";
import type { CommentReaction } from "metabase-types/api";

import S from "./Discussion.module.css";

interface Props {
  reaction: CommentReaction;
  onReaction: (emoji: string) => void;
  onReactionRemove: (emoji: string) => void;
}

export function Reaction({ reaction, onReaction, onReactionRemove }: Props) {
  const currentUser = checkNotNull(useSelector(getCurrentUser));
  const isCurrentUserReaction = useMemo(
    () => reaction.users.some((user) => user.id === currentUser.id),
    [reaction.users, currentUser.id],
  );

  const reactionLabel = useMemo(
    () => reaction.users.map((user) => user.name).join(", "),
    [reaction.users],
  );

  const handleReactionClick = useCallback(() => {
    if (isCurrentUserReaction) {
      onReactionRemove(reaction.emoji);
    } else {
      onReaction(reaction.emoji);
    }
  }, [isCurrentUserReaction, onReactionRemove, onReaction, reaction]);

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
