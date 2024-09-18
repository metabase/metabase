import _ from "underscore";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { Group } from "metabase/ui";

import type { Reaction as ReactionType } from "../../types";
import { Reaction } from "../reaction";
import { AddReaction } from "../reaction/AddReaction";

export const ReactionList = ({
  onAddReaction,
  reactions,
}: {
  onAddReaction: (reaction: string) => void;
  reactions: ReactionType[];
}) => {
  const groupedReactions = Object.entries(_.groupBy(reactions, "emoji"));
  const user = useSelector(getCurrentUser);

  return (
    <Group spacing="xs">
      {groupedReactions.map(([emoji, userList]) => {
        const isSelected = userList.some(u => u.author.email === user.email);
        return (
          <Reaction
            isSelected={isSelected}
            key={emoji}
            userList={userList.map(u => u.author)}
            emoji={emoji}
            onAddReaction={isSelected ? () => {} : onAddReaction}
          />
        );
      })}
      <AddReaction onSelect={onAddReaction} />
    </Group>
  );
};
