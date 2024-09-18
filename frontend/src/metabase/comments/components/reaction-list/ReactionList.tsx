import _ from "underscore";

import { Group } from "metabase/ui";

import type { Reaction as ReactionType } from "../../types";
import { Reaction } from "../reaction";
import { AddReaction } from "../reaction/AddReaction";

export const ReactionList = ({ reactions }: { reactions: ReactionType[] }) => {
  const groupedReactions = Object.entries(_.groupBy(reactions, "content"));

  return (
    <Group spacing="xs">
      {groupedReactions.map(([emoji, userList]) => (
        <Reaction
          key={emoji}
          userList={userList.map(u => u.author)}
          emoji={emoji}
        />
      ))}
      <AddReaction />
    </Group>
  );
};
