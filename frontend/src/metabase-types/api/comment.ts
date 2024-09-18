import type { User } from "./user";

export type CommentModel = "dashboard" | "card" | "comment";

type CommentId = number;

export interface Comment {
  id: CommentId;
  created_at: string;
  updated_at: string;
  model: CommentModel;
  model_id: number;
  text: string;
  resolved: boolean;
  resolved_at: boolean;
  reactions: Reaction[];
  author: User;
  replies: Comment[];
}

export interface Reaction {
  id: number;
  content: "string"; // but only emojis
  author: User;
}

export interface CreateCommentRequest {
  model: CommentModel;
  model_id: number;
  text: string;
}

export interface ReactToCommentRequest {
  id: CommentId;
  content: string;
}

export interface ResolveCommentRequest {
  id: CommentId;
  resolved: true;
}
