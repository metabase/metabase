import type { Reaction as ReactionType } from "metabase/comments/types";
import { Text } from "metabase/ui";

import { ReactionBadge } from "./ReactionBadge";

function formatList(items: string[]) {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return items.join(" and ");
  }

  // For lists with more than 2 items
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export const Reaction = ({
  userList,
  emoji,
  onAddReaction,
}: {
  userList: ReactionType["author"][];
  emoji: ReactionType["emoji"];
  onAddReaction: (value: string) => void;
}) => (
  <ReactionBadge
    left={
      <Text span lh={1} c="text-dark" fz="sm">
        {emoji}
      </Text>
    }
    right={
      <Text span lh={1} ml="2px" c="text-dark" fz="sm" fw="normal">
        {userList.length}
      </Text>
    }
    onClick={() => onAddReaction(emoji)}
    tooltipLabel={
      <Text fz="sm" span c="text-white">
        {formatList(
          userList.map(
            user => `${user.first_name} ${user.last_name}` || user.email,
          ),
        )}
        <Text fz="sm" span c="text-medium">
          {` reacted with  ${emoji}`}
        </Text>
      </Text>
    }
  />
);
