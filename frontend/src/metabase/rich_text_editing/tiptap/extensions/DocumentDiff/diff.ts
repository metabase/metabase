import type { JSONContent } from "@tiptap/core";
import { diffArrays } from "diff";

// Block-level diff between two documents. We compare the top-level block array
// (headings, paragraphs, lists, chart embeds, …) rather than characters, so a
// reworded paragraph shows as the old block struck through followed by the new
// one — matching the per-block accept/reject UI.

export type BlockStatus = "unchanged" | "added" | "removed";

export type DiffBlock = {
  block: JSONContent;
  status: BlockStatus;
  // Adjacent removed+added blocks share a `changeId` so they accept/reject as
  // one unit. `null` for unchanged blocks.
  changeId: number | null;
};

export type BlockDiff = {
  blocks: DiffBlock[];
  changeCount: number;
};

function extractText(node: JSONContent): string {
  if (typeof node.text === "string") {
    return node.text;
  }
  return (node.content ?? []).map(extractText).join("");
}

function cardIds(node: JSONContent): number[] {
  if (node.type === "cardEmbed" && typeof node.attrs?.id === "number") {
    return [node.attrs.id];
  }
  return (node.content ?? []).flatMap(cardIds);
}

// A block's identity for diffing: its type, a couple of structural attrs, and
// its text. Two blocks with the same key are treated as unchanged.
function blockKey(block: JSONContent): string {
  const ids = cardIds(block);
  const extra =
    block.type === "heading"
      ? `:${block.attrs?.level ?? 1}`
      : ids.length > 0
        ? `:${ids.join(",")}`
        : "";
  return `${block.type}${extra}|${extractText(block)}`;
}

/**
 * Diff two top-level block arrays into a single merged sequence annotated with
 * add/remove status and change groupings.
 */
export function diffBlocks(
  oldBlocks: JSONContent[],
  newBlocks: JSONContent[],
): BlockDiff {
  const parts = diffArrays(oldBlocks, newBlocks, {
    comparator: (a, b) => blockKey(a) === blockKey(b),
  });

  const blocks: DiffBlock[] = [];
  let changeCount = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      for (const block of part.value) {
        blocks.push({ block, status: "unchanged", changeId: null });
      }
      continue;
    }
    if (part.removed) {
      const next = parts[i + 1];
      const changeId = changeCount++;
      for (const block of part.value) {
        blocks.push({ block, status: "removed", changeId });
      }
      // A removed run immediately followed by an added run is a single
      // "replacement" change.
      if (next?.added) {
        for (const block of next.value) {
          blocks.push({ block, status: "added", changeId });
        }
        i += 1;
      }
      continue;
    }
    // Pure insertion.
    const changeId = changeCount++;
    for (const block of part.value) {
      blocks.push({ block, status: "added", changeId });
    }
  }

  return { blocks, changeCount };
}

/** Whether any change is still awaiting accept/reject. */
export function hasPendingChanges(diff: BlockDiff): boolean {
  return diff.blocks.some((b) => b.status !== "unchanged");
}

/**
 * Resolve a single change: `accept` keeps the new (added) blocks and drops the
 * old (removed) ones; rejecting does the opposite. Surviving blocks become
 * `unchanged`. Returns a new `BlockDiff`.
 */
export function resolveChange(
  diff: BlockDiff,
  changeId: number,
  accept: boolean,
): BlockDiff {
  const dropStatus: BlockStatus = accept ? "removed" : "added";
  const blocks = diff.blocks
    .filter((b) => !(b.changeId === changeId && b.status === dropStatus))
    .map((b) =>
      b.changeId === changeId
        ? { block: b.block, status: "unchanged" as const, changeId: null }
        : b,
    );
  return { blocks, changeCount: diff.changeCount };
}

/** Resolve every outstanding change at once (Accept all / Reject all). */
export function resolveAll(diff: BlockDiff, accept: boolean): BlockDiff {
  const dropStatus: BlockStatus = accept ? "removed" : "added";
  const blocks = diff.blocks
    .filter((b) => b.status !== dropStatus)
    .map((b) => ({
      block: b.block,
      status: "unchanged" as const,
      changeId: null,
    }));
  return { blocks, changeCount: diff.changeCount };
}

/** The document blocks as they stand (dropping not-yet-resolved removed blocks). */
export function toContent(diff: BlockDiff): JSONContent[] {
  return diff.blocks.filter((b) => b.status !== "removed").map((b) => b.block);
}
