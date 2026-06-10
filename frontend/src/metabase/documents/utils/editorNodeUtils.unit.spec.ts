import { Schema } from "@tiptap/pm/model";
import type { Editor, NodeViewProps } from "@tiptap/react";

import { isTopLevel } from "./editorNodeUtils";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    flexContainer: { group: "block", content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
});

const buildEditor = (doc: ReturnType<Schema["node"]>) =>
  ({ state: { doc } }) as unknown as Editor;

const buildArgs = (
  editor: Editor | null,
  getPos: NodeViewProps["getPos"] | null,
) =>
  ({ editor, getPos }) as unknown as Pick<NodeViewProps, "editor" | "getPos">;

describe("isTopLevel", () => {
  it("returns true for a top-level block", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hello")]),
    ]);
    // Position 0 is before the top-level paragraph (depth 0).
    expect(isTopLevel(buildArgs(buildEditor(doc), () => 0))).toBe(true);
  });

  it("returns false for a nested block", () => {
    const doc = schema.node("doc", null, [
      schema.node("flexContainer", null, [
        schema.node("paragraph", null, [schema.text("nested")]),
      ]),
    ]);
    // Position 1 is inside the flexContainer, before the nested paragraph.
    expect(isTopLevel(buildArgs(buildEditor(doc), () => 1))).toBe(false);
  });

  it("returns true (without throwing) for a stale out-of-range position", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hi")]),
    ]);
    const stalePos = doc.content.size + 100;
    expect(() =>
      isTopLevel(buildArgs(buildEditor(doc), () => stalePos)),
    ).not.toThrow();
    expect(isTopLevel(buildArgs(buildEditor(doc), () => stalePos))).toBe(true);
  });

  it("returns true (without throwing) for a negative position", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hi")]),
    ]);
    expect(isTopLevel(buildArgs(buildEditor(doc), () => -1))).toBe(true);
  });

  it("returns true when editor or getPos is missing", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hi")]),
    ]);
    expect(isTopLevel(buildArgs(null, () => 0))).toBe(true);
    expect(isTopLevel(buildArgs(buildEditor(doc), null))).toBe(true);
  });

  it("returns true when getPos returns undefined", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hi")]),
    ]);
    expect(isTopLevel(buildArgs(buildEditor(doc), () => undefined))).toBe(true);
    expect(
      isTopLevel(buildArgs(buildEditor(doc), () => undefined as never)),
    ).toBe(true);
  });
});
