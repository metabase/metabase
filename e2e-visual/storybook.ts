import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { STORYBOOK_STATIC_DIR } from "./paths";
import { STORY_FILTERS } from "./stories.config";

const SKIP_TAG = "no-visual";

export const STATIC_SERVER_PORT = 6008;

const externalStorybookUrl = process.env.STORYBOOK_URL || undefined;

export const STORYBOOK_URL = withTrailingSlash(
  externalStorybookUrl ?? `http://localhost:${STATIC_SERVER_PORT}`,
);

export const usesExternalStorybook = externalStorybookUrl !== undefined;

export type Story = {
  id: string;
  title: string;
  name: string;
  importPath: string;
  tags: string[];
};

export type StorySelection = {
  files: readonly string[];
  grep: RegExp | undefined;
};

export function getSnapshotName(story: Story) {
  return `${story.id}.png`;
}

export function loadStories(): Story[] {
  const index: unknown = JSON.parse(readStoryIndex());
  if (!isRecord(index) || !isRecord(index.entries)) {
    throw new Error("The Storybook index has no entries object");
  }
  const entries = Object.values(index.entries).filter(
    (entry) => isRecord(entry) && entry.type === "story",
  );
  const malformed = entries.filter((entry) => !isStory(entry));
  if (malformed.length > 0) {
    throw new Error(
      `Unexpected story entries in the Storybook index: ${JSON.stringify(malformed.slice(0, 3))}`,
    );
  }
  return entries.filter(isStory);
}

export function selectStories(
  stories: readonly Story[],
  { files, grep }: StorySelection,
): Story[] {
  const defaultFilter = new RegExp(STORY_FILTERS.join("|"), "i");
  const fileSet = new Set(files.map(normalizePath));

  const unknownFiles = [...fileSet].filter(
    (file) =>
      !stories.some((story) => normalizePath(story.importPath) === file),
  );
  if (unknownFiles.length > 0) {
    throw new Error(
      `VISUAL_FILES names files with no stories in the Storybook index: ${unknownFiles.join(", ")}`,
    );
  }

  return stories.filter((story) => {
    const fullName = `${story.title} ${story.name}`;
    return (
      !story.tags.includes(SKIP_TAG) &&
      defaultFilter.test(fullName) &&
      (fileSet.size === 0 || fileSet.has(normalizePath(story.importPath))) &&
      (grep === undefined || grep.test(fullName))
    );
  });
}

export function getSelectionFromEnv(): StorySelection {
  const files = (process.env.VISUAL_FILES ?? "")
    .split(",")
    .map((file) => file.trim())
    .filter((file) => file.length > 0);
  const grep = process.env.VISUAL_GREP;
  return {
    files,
    grep: grep ? new RegExp(grep, "i") : undefined,
  };
}

function readStoryIndex(): string {
  if (usesExternalStorybook) {
    // Test files are collected synchronously, so the index is fetched in a child process.
    return execFileSync(
      process.execPath,
      [
        "-e",
        `fetch(process.argv[1]).then(async (response) => {
          if (!response.ok) {
            throw new Error(response.status + " " + response.statusText);
          }
          process.stdout.write(await response.text());
        })`,
        new URL("index.json", STORYBOOK_URL).href,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  }

  const indexPath = path.join(STORYBOOK_STATIC_DIR, "index.json");
  if (!existsSync(indexPath)) {
    throw new Error(
      `${indexPath} does not exist. Run "bun run build-storybook:test" first, or set STORYBOOK_URL.`,
    );
  }
  return readFileSync(indexPath, "utf8");
}

function isStory(entry: unknown): entry is Story {
  return (
    isRecord(entry) &&
    entry.type === "story" &&
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.name === "string" &&
    typeof entry.importPath === "string" &&
    Array.isArray(entry.tags) &&
    entry.tags.every((tag) => typeof tag === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePath(filePath: string) {
  return filePath.replace(/^\.\//, "");
}

function withTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}
