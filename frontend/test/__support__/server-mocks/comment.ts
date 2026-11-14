import fetchMock, { type CallLog } from "fetch-mock";

import type {
  BaseUser,
  Comment,
  CommentId,
  MentionableUser,
  UpdateCommentRequest,
} from "metabase-types/api";
import { createMockComment } from "metabase-types/api/mocks/comment";

export const setupCommentEndpoints = (
  comments: Comment[],
  { target_type, target_id }: { target_type: "document"; target_id: number },
) => {
  const url = new URL("api/comment", "http://localhost");
  url.searchParams.append("target_type", target_type);
  url.searchParams.append("target_id", target_id.toString());

  fetchMock.get(`path:${url.pathname}${url.search}`, { comments });
};

/**
 * Mocks `PUT /api/comment/:id`. Updates the matching comment in `comments` in
 * place, so a list endpoint set up with the same array returns the change.
 */
export const setupUpdateCommentEndpoint = (comments: Comment[]) => {
  fetchMock.put("express:/api/comment/:id", ({ expressParams, options }) => {
    const id = Number(expressParams?.id);
    const index = comments.findIndex((comment) => comment.id === id);
    if (index === -1) {
      return 404;
    }
    const changes: UpdateCommentRequest = JSON.parse(String(options.body));
    comments[index] = { ...comments[index], ...changes };
    return comments[index];
  });
};

export const setupListMentionsEndpoint = (users: MentionableUser[]) => {
  fetchMock.get("path:/api/comment/mentions", { data: users });
};

interface StatefulCommentEndpointsOpts {
  comments: Comment[];
  currentUser: Pick<BaseUser, "id" | "common_name">;
}

/**
 * Mocks the comment API as a small in-memory backend: the list endpoint
 * returns the comments created, updated, deleted or reacted to by the other
 * endpoints, so the UI sees the same data after a refetch as a real server
 * would return.
 */
export const setupStatefulCommentEndpoints = ({
  comments: initialComments,
  currentUser,
}: StatefulCommentEndpointsOpts) => {
  let comments = [...initialComments];
  let nextId = Math.max(0, ...initialComments.map(({ id }) => id)) + 1;

  const findComment = (call: CallLog) => {
    const id = Number(call.expressParams?.id);
    const comment = comments.find((comment) => comment.id === id);
    if (!comment) {
      throw new Error(`Unknown comment ${id}`);
    }
    return comment;
  };

  const replaceComment = (comment: Comment) => {
    comments = comments.map((existing) =>
      existing.id === comment.id ? comment : existing,
    );
    return comment;
  };

  fetchMock.get("path:/api/comment", () => ({
    comments: getVisibleComments(comments),
  }));

  fetchMock.post("path:/api/comment", (call) => {
    const body = readBody(call);
    const comment = createMockComment({
      id: nextId++,
      target_type:
        body.target_type === "exploration" ? "exploration" : "document",
      target_id: readId(body.target_id),
      child_target_id: readString(body.child_target_id),
      parent_comment_id: readCommentId(body.parent_comment_id),
      content: readObject(body.content),
      creator: { ...createMockComment().creator, ...currentUser },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    comments = [...comments, comment];
    return comment;
  });

  fetchMock.put("express:/api/comment/:id", (call) => {
    const body = readBody(call);
    const comment = findComment(call);
    return replaceComment({
      ...comment,
      ...(typeof body.is_resolved === "boolean"
        ? { is_resolved: body.is_resolved }
        : {}),
      ...(body.content != null ? { content: readObject(body.content) } : {}),
    });
  });

  fetchMock.delete("express:/api/comment/:id", (call) => {
    replaceComment({
      ...findComment(call),
      deleted_at: new Date().toISOString(),
    });
    return 204;
  });

  fetchMock.post("express:/api/comment/:id/reaction", (call) => {
    const emoji = readString(readBody(call).emoji) ?? "";
    const comment = findComment(call);
    const reaction = comment.reactions.find(
      (reaction) => reaction.emoji === emoji,
    );
    const hasReacted = Boolean(
      reaction?.users.some((user) => user.id === currentUser.id),
    );
    const user = { id: currentUser.id, name: currentUser.common_name };
    const users = hasReacted
      ? (reaction?.users ?? []).filter(({ id }) => id !== currentUser.id)
      : [...(reaction?.users ?? []), user];
    const updatedReaction = { emoji, count: users.length, users };
    const reactions = reaction
      ? comment.reactions.map((existing) =>
          existing.emoji === emoji ? updatedReaction : existing,
        )
      : [...comment.reactions, updatedReaction];

    replaceComment({
      ...comment,
      reactions: reactions.filter(({ count }) => count > 0),
    });
    return { reacted: !hasReacted };
  });

  return { getComments: () => comments };
};

// Like the backend list endpoint: a deleted comment is omitted unless it has
// replies, in which case it is kept with its content scrubbed.
function getVisibleComments(comments: Comment[]): Comment[] {
  const parentIds = new Set(
    comments.map(({ parent_comment_id }) => parent_comment_id),
  );
  return comments.flatMap((comment) => {
    if (!comment.deleted_at) {
      return [comment];
    }
    return parentIds.has(comment.id) ? [{ ...comment, content: {} }] : [];
  });
}

function readBody(call: CallLog): Record<string, unknown> {
  const body: unknown = JSON.parse(String(call.options.body ?? "{}"));
  return isRecord(body) ? body : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readCommentId(value: unknown): CommentId | null {
  return typeof value === "number" ? value : null;
}

function readId(value: unknown): string | number {
  return typeof value === "number" || typeof value === "string" ? value : 0;
}
