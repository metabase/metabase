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
  id: number;
  text: string;
  created_at: string;
  updated_at: string;
  resolved: boolean;
  reactions: Reaction[];
  author: Pick<User, "id" | "first_name" | "last_name" | "email">;
  replies?: Comment[];
};

export type Reaction = {
  emoji: string;
  author: Pick<User, "id" | "first_name" | "last_name" | "email">;
  id: ReactionId;
};
