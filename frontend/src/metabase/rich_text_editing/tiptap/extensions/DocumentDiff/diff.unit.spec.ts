import type { JSONContent } from "@tiptap/core";

import {
  diffBlocks,
  hasPendingChanges,
  resolveAll,
  resolveChange,
  toContent,
} from "./diff";

const para = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const heading = (level: number, text: string): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

const chart = (id: number): JSONContent => ({
  type: "resizeNode",
  content: [{ type: "cardEmbed", attrs: { id } }],
});

const statuses = (blocks: ReturnType<typeof diffBlocks>["blocks"]) =>
  blocks.map((b) => b.status);

describe("diffBlocks", () => {
  it("marks identical documents as fully unchanged", () => {
    const blocks = [heading(1, "Title"), para("Body")];
    const diff = diffBlocks(blocks, blocks);
    expect(diff.changeCount).toBe(0);
    expect(statuses(diff.blocks)).toEqual(["unchanged", "unchanged"]);
    expect(hasPendingChanges(diff)).toBe(false);
  });

  it("treats a reworded block as a single replace change (removed then added)", () => {
    const diff = diffBlocks(
      [heading(1, "Title"), para("Old body")],
      [heading(1, "Title"), para("New body")],
    );
    expect(diff.changeCount).toBe(1);
    expect(statuses(diff.blocks)).toEqual(["unchanged", "removed", "added"]);
    const [, removed, added] = diff.blocks;
    expect(removed.changeId).toBe(added.changeId);
  });

  it("detects a pure insertion", () => {
    const diff = diffBlocks([para("a")], [para("a"), para("b")]);
    expect(statuses(diff.blocks)).toEqual(["unchanged", "added"]);
    expect(diff.changeCount).toBe(1);
  });

  it("detects a pure removal", () => {
    const diff = diffBlocks([para("a"), para("b")], [para("a")]);
    expect(statuses(diff.blocks)).toEqual(["unchanged", "removed"]);
  });

  it("keeps an unchanged chart embed unchanged but flags a swapped one", () => {
    const same = diffBlocks([chart(7)], [chart(7)]);
    expect(statuses(same.blocks)).toEqual(["unchanged"]);

    const swapped = diffBlocks([chart(7)], [chart(9)]);
    expect(statuses(swapped.blocks)).toEqual(["removed", "added"]);
  });
});

describe("resolveChange / resolveAll", () => {
  const diff = diffBlocks(
    [heading(1, "Title"), para("Old body")],
    [heading(1, "Title"), para("New body")],
  );

  it("accepting a change keeps the new block and drops the old", () => {
    const resolved = resolveChange(diff, 0, true);
    expect(hasPendingChanges(resolved)).toBe(false);
    expect(toContent(resolved)).toEqual([
      heading(1, "Title"),
      para("New body"),
    ]);
  });

  it("rejecting a change keeps the old block and drops the new", () => {
    const resolved = resolveChange(diff, 0, false);
    expect(hasPendingChanges(resolved)).toBe(false);
    expect(toContent(resolved)).toEqual([
      heading(1, "Title"),
      para("Old body"),
    ]);
  });

  it("resolveAll(accept) yields the proposed document", () => {
    expect(toContent(resolveAll(diff, true))).toEqual([
      heading(1, "Title"),
      para("New body"),
    ]);
  });

  it("resolveAll(reject) yields the original document", () => {
    expect(toContent(resolveAll(diff, false))).toEqual([
      heading(1, "Title"),
      para("Old body"),
    ]);
  });
});
