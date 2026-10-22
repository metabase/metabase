import fs from "node:fs";
import path from "node:path";

import {
  DATA_APP_COMMENTS_DIRECTORY,
  DATA_APP_COMMENTS_FILE_NAME,
  DATA_APP_COMMENTS_LIMIT,
} from "../constants/comments-channel";
import type { DataAppComment, DataAppCommentsFile } from "../types/comments";

import { normalizeStoredComment } from "./draft";

/** The app-local scratch directory the dev server keeps comments in. */
export const getCommentsDirectory = (appRoot: string): string =>
  path.join(appRoot, DATA_APP_COMMENTS_DIRECTORY);

export const getCommentsFilePath = (appRoot: string): string =>
  path.join(getCommentsDirectory(appRoot), DATA_APP_COMMENTS_FILE_NAME);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Reads the comments file, dropping entries that aren't comments. Returns an
 * empty list when the file is missing or unparseable: a hand-edit that broke the
 * JSON must not take the dev server down with it.
 */
export const readCommentsFile = (filePath: string): DataAppComment[] => {
  let contents: string;

  try {
    contents = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch {
    return [];
  }

  const comments = isRecord(parsed) ? parsed.comments : null;

  if (!Array.isArray(comments)) {
    return [];
  }

  return comments
    .map(normalizeStoredComment)
    .filter((comment): comment is DataAppComment => comment !== null)
    .slice(-DATA_APP_COMMENTS_LIMIT);
};

/**
 * Writes the comments file, creating the `.data-app` directory with a `.gitignore`
 * that ignores the whole directory — comments are one developer's notes about a
 * preview, never part of the app's committed source.
 *
 * The write goes to a sibling temp file first, so a reader (the CLI, an agent)
 * never sees a half-written file.
 */
export const writeCommentsFile = (
  filePath: string,
  comments: DataAppComment[],
): void => {
  const directory = path.dirname(filePath);

  fs.mkdirSync(directory, { recursive: true });

  const gitignorePath = path.join(directory, ".gitignore");

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, "*\n");
  }

  const file: DataAppCommentsFile = { version: 1, comments };
  const temporaryPath = `${filePath}.${process.pid}.tmp`;

  fs.writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
};

/** The file's modification time in ms, or `null` when it does not exist. */
export const getCommentsFileMtime = (filePath: string): number | null => {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
};
