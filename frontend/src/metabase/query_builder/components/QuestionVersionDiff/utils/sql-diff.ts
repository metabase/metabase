import { diffArrays, diffWordsWithSpace } from "diff";

export type DiffLineType = "context" | "added" | "removed";

export interface DiffSegment {
  value: string;
  /** true when this part of the line differs from its counterpart line */
  isChanged: boolean;
}

export interface DiffLine {
  type: DiffLineType;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  segments: DiffSegment[];
}

export interface SideBySideRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

export type DiffBlock<T> =
  | { type: "visible"; items: T[] }
  | { type: "collapsed"; items: T[] };

export interface DiffStats {
  added: number;
  removed: number;
}

export function splitLines(text: string): string[] {
  if (text === "") {
    return [];
  }
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  return segments.reduce<DiffSegment[]>((merged, segment) => {
    const last = merged[merged.length - 1];
    if (last && last.isChanged === segment.isChanged) {
      last.value += segment.value;
    } else if (segment.value !== "") {
      merged.push({ ...segment });
    }
    return merged;
  }, []);
}

/**
 * Word-level diff between a removed line and the added line that replaced it,
 * used to highlight what changed within the line.
 */
export function diffLineContent(
  oldLine: string,
  newLine: string,
): { oldSegments: DiffSegment[]; newSegments: DiffSegment[] } {
  const parts = diffWordsWithSpace(oldLine, newLine);
  const hasCommonContent = parts.some(
    (part) => !part.added && !part.removed && part.value.trim() !== "",
  );

  // Highlighting everything in two unrelated lines only adds noise
  if (!hasCommonContent) {
    return {
      oldSegments: [{ value: oldLine, isChanged: false }],
      newSegments: [{ value: newLine, isChanged: false }],
    };
  }

  return {
    oldSegments: mergeSegments(
      parts
        .filter((part) => !part.added)
        .map((part) => ({ value: part.value, isChanged: !!part.removed })),
    ),
    newSegments: mergeSegments(
      parts
        .filter((part) => !part.removed)
        .map((part) => ({ value: part.value, isChanged: !!part.added })),
    ),
  };
}

const plainSegments = (line: string): DiffSegment[] => [
  { value: line, isChanged: false },
];

/**
 * Line-level diff in unified order: within each change, removed lines come
 * before the added lines that replace them (like `git diff`). Removed and added
 * lines at the same position of a change are paired to highlight the changed
 * words within them.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const changes = diffArrays(splitLines(oldText), splitLines(newText));
  const lines: DiffLine[] = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let pendingRemoved: string[] = [];

  const pushRemoved = (line: string, segments = plainSegments(line)) => {
    lines.push({
      type: "removed",
      oldLineNumber: oldLineNumber++,
      newLineNumber: null,
      segments,
    });
  };

  const flushRemoved = () => {
    pendingRemoved.forEach((line) => pushRemoved(line));
    pendingRemoved = [];
  };

  changes.forEach((change) => {
    if (change.removed) {
      flushRemoved();
      pendingRemoved = change.value;
    } else if (change.added) {
      const removed = pendingRemoved;
      pendingRemoved = [];
      const contentDiffs = change.value
        .slice(0, removed.length)
        .map((addedLine, index) => diffLineContent(removed[index], addedLine));

      removed.forEach((line, index) =>
        pushRemoved(line, contentDiffs[index]?.oldSegments),
      );
      change.value.forEach((line, index) => {
        lines.push({
          type: "added",
          oldLineNumber: null,
          newLineNumber: newLineNumber++,
          segments: contentDiffs[index]?.newSegments ?? plainSegments(line),
        });
      });
    } else {
      flushRemoved();
      change.value.forEach((line) => {
        lines.push({
          type: "context",
          oldLineNumber: oldLineNumber++,
          newLineNumber: newLineNumber++,
          segments: plainSegments(line),
        });
      });
    }
  });
  flushRemoved();

  return lines;
}

/**
 * Converts unified diff lines into rows of a side-by-side view, aligning each
 * removed line with the added line that replaced it.
 */
export function toSideBySideRows(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.type === "context") {
      rows.push({ left: line, right: line });
      index++;
      continue;
    }

    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (index < lines.length && lines[index].type === "removed") {
      removed.push(lines[index++]);
    }
    while (index < lines.length && lines[index].type === "added") {
      added.push(lines[index++]);
    }
    for (let i = 0; i < Math.max(removed.length, added.length); i++) {
      rows.push({ left: removed[i] ?? null, right: added[i] ?? null });
    }
  }

  return rows;
}

/**
 * Hides long runs of unchanged items, keeping `contextSize` items of context
 * around every change, like GitHub does.
 */
export function collapseUnchanged<T>(
  items: T[],
  isUnchanged: (item: T) => boolean,
  contextSize = 3,
): DiffBlock<T>[] {
  const blocks: DiffBlock<T>[] = [];
  const pushVisible = (visibleItems: T[]) => {
    if (visibleItems.length === 0) {
      return;
    }
    const last = blocks[blocks.length - 1];
    if (last?.type === "visible") {
      last.items.push(...visibleItems);
    } else {
      blocks.push({ type: "visible", items: [...visibleItems] });
    }
  };

  let index = 0;
  while (index < items.length) {
    if (!isUnchanged(items[index])) {
      pushVisible([items[index++]]);
      continue;
    }

    const start = index;
    while (index < items.length && isUnchanged(items[index])) {
      index++;
    }
    const run = items.slice(start, index);
    const leading = start === 0 ? 0 : contextSize;
    const trailing = index === items.length ? 0 : contextSize;
    const hiddenCount = run.length - leading - trailing;

    // Hiding a single line saves no space
    if (hiddenCount < 2) {
      pushVisible(run);
    } else {
      pushVisible(run.slice(0, leading));
      blocks.push({
        type: "collapsed",
        items: run.slice(leading, run.length - trailing),
      });
      pushVisible(run.slice(run.length - trailing));
    }
  }

  return blocks;
}

export function getDiffStats(lines: DiffLine[]): DiffStats {
  return {
    added: lines.filter((line) => line.type === "added").length,
    removed: lines.filter((line) => line.type === "removed").length,
  };
}
