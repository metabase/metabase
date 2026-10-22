import { DATA_APP_COMMENTS_LIMIT } from "../constants/comments-channel";
import type {
  DataAppAgentRun,
  DataAppComment,
  DataAppCommentDraft,
  DataAppCommentStatus,
} from "../types/comments";

import {
  getCommentsFileMtime,
  readCommentsFile,
  writeCommentsFile,
} from "./file";

export interface CommentPatch {
  status?: DataAppCommentStatus;
  body?: string;
}

/**
 * The app's review comments, kept in `.data-app/comments.json`.
 *
 * The file is the source of truth, not this object: an agent is told it may read
 * and rewrite it, so every read checks the file's mtime first and re-reads when
 * something else changed it. That is what lets an agent resolve a comment from
 * the shell and have the dock show it resolved a moment later.
 */
export class CommentsStore {
  private comments: DataAppComment[] = [];
  private knownMtime: number | null = null;
  private lastChangeAt: number | null = null;
  private nextId = 1;

  constructor(private readonly filePath: string) {
    this.reload();
  }

  list(status?: DataAppCommentStatus): DataAppComment[] {
    this.reloadIfChangedOnDisk();

    return status
      ? this.comments.filter((comment) => comment.status === status)
      : this.comments;
  }

  find(id: string): DataAppComment | null {
    this.reloadIfChangedOnDisk();

    return this.comments.find((comment) => comment.id === id) ?? null;
  }

  add(draft: DataAppCommentDraft): DataAppComment {
    this.reloadIfChangedOnDisk();

    const comment: DataAppComment = {
      ...draft,
      id: this.takeId(),
      status: "open",
      createdAt: Date.now(),
      resolvedAt: null,
      agentRun: null,
    };

    this.commit([...this.comments, comment].slice(-DATA_APP_COMMENTS_LIMIT));

    return comment;
  }

  update(id: string, patch: CommentPatch): DataAppComment | null {
    return this.replace(id, (comment) => ({
      ...comment,
      body: patch.body ?? comment.body,
      status: patch.status ?? comment.status,
      resolvedAt:
        patch.status === "resolved"
          ? (comment.resolvedAt ?? Date.now())
          : patch.status === "open"
            ? null
            : comment.resolvedAt,
    }));
  }

  setAgentRun(id: string, agentRun: DataAppAgentRun): DataAppComment | null {
    return this.replace(id, (comment) => ({ ...comment, agentRun }));
  }

  remove(id: string): boolean {
    this.reloadIfChangedOnDisk();

    const remaining = this.comments.filter((comment) => comment.id !== id);

    if (remaining.length === this.comments.length) {
      return false;
    }

    this.commit(remaining);

    return true;
  }

  clear(): void {
    this.commit([]);
  }

  getLastChangeAt(): number | null {
    this.reloadIfChangedOnDisk();

    return this.lastChangeAt;
  }

  private replace(
    id: string,
    change: (comment: DataAppComment) => DataAppComment,
  ): DataAppComment | null {
    this.reloadIfChangedOnDisk();

    const existing = this.comments.find((comment) => comment.id === id);

    if (!existing) {
      return null;
    }

    const updated = change(existing);

    this.commit(
      this.comments.map((comment) => (comment.id === id ? updated : comment)),
    );

    return updated;
  }

  private commit(comments: DataAppComment[]): void {
    this.comments = comments;
    this.lastChangeAt = Date.now();

    writeCommentsFile(this.filePath, comments);
    this.knownMtime = getCommentsFileMtime(this.filePath);
  }

  private reloadIfChangedOnDisk(): void {
    if (getCommentsFileMtime(this.filePath) !== this.knownMtime) {
      this.reload();
      this.lastChangeAt = Date.now();
    }
  }

  private reload(): void {
    this.comments = readCommentsFile(this.filePath);
    this.knownMtime = getCommentsFileMtime(this.filePath);
    this.nextId = 1;
  }

  /**
   * Ids are short (`c1`, `c2`) because a developer types them at a shell and an
   * agent repeats them back. The counter restarts from whatever is on disk, so
   * an id is never reused while the comment holding it still exists.
   */
  private takeId(): string {
    const taken = new Set(this.comments.map((comment) => comment.id));

    while (taken.has(`c${this.nextId}`)) {
      this.nextId += 1;
    }

    return `c${this.nextId}`;
  }
}
