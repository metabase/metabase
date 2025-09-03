import type { Comment, CommentId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

export interface CommentThread {
  id: CommentId;
  comments: Comment[];
}

// Storage state for the Mention extension (accessed via editor.storage.mention)
export type MentionStorage = {
  isMentionPopupOpen: boolean;
};

export type CommentsStorage = {
  mention: MentionStorage;
};

export function isMentionStorage(value: unknown): value is MentionStorage {
  return isObject(value) && typeof value.isMentionPopupOpen === "boolean";
}

export function isCommentsStorage(value: unknown): value is CommentsStorage {
  return isObject(value) && isMentionStorage(value.mention);
}
