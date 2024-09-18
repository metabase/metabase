import type { Reaction as ReactionType } from "metabase/comments/types";

export const Reaction = ({ reaction }: { reaction: ReactionType }) => {
  return (
    <div>
      {reaction.author.first_name}
      {reaction.author.last_name}
      {reaction.content}
      {reaction.id}
    </div>
  );
};
