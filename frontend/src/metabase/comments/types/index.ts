import type { CardId, DashboardId, User } from "metabase-types/api";

type ReactionId = number;
type CommentId = number;

type ModelRef =
  | {
      model: "dashboard";
      model_id: DashboardId;
    }
  | {
      model: "card";
      model_id: CardId;
    }
  | {
      model: "comment";
      model_id: CommentId;
    }
  | {
      model: "data";
      model_id: number;
    };

export type Comment = ModelRef & {
  text: string;
  resolved: boolean;
  reactions: Reaction[];
  author: User;
  replies?: Comment[];
};

export type Reaction = {
  content: "string";
  author: User;
  id: ReactionId;
};
