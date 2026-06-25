import { Schema } from "@tiptap/pm/model";
import type { Editor, NodeViewProps } from "@tiptap/react";
import fetchMock from "fetch-mock";

import { setupMockIntersectionObserver } from "__support__/intersection-observer";
import { setupCommentEndpoints } from "__support__/server-mocks";
import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import { delay } from "__support__/utils";
import { initialState as documentsInitialState } from "metabase/documents/documents.slice";
import {
  createMockNodeViewProps,
  createMockProseMirrorNode,
} from "metabase/rich_text_editing/tiptap/extensions/MetabotEmbed/__support__/node-view-mocks";
import type { Comment } from "metabase-types/api";
import { createMockDocument } from "metabase-types/api/mocks";
import { createMockComment } from "metabase-types/api/mocks/comment";

import { isTopLevel, useBlockMenus } from "./use-block-menus";

const NODE_ID = "test-id";
const mockDocument = createMockDocument({ id: 1 });

const nodeViewProps = createMockNodeViewProps({
  node: createMockProseMirrorNode({
    attrs: { _id: NODE_ID },
    textContent: "test content",
  }),
});

describe("useBlockMenus", () => {
  const { setIntersecting } = setupMockIntersectionObserver();

  function setup({ comments }: { comments: Comment[] }) {
    setupCommentEndpoints(comments, {
      target_type: "document",
      target_id: mockDocument.id,
    });

    const { result } = renderHookWithProviders(
      () =>
        useBlockMenus({
          node: nodeViewProps.node,
          editor: nodeViewProps.editor,
          getPos: nodeViewProps.getPos,
        }),
      {
        storeInitialState: {
          documents: {
            ...documentsInitialState,
            currentDocument: mockDocument,
          },
        },
      },
    );

    // Attach a reference element so the IntersectionObserver starts observing.
    act(() => {
      result.current.setReferenceElement(document.createElement("div"));
    });

    return { result };
  }

  it("does not fetch comments or show menus while off-screen", async () => {
    const { result } = setup({
      comments: [createMockComment({ child_target_id: NODE_ID })],
    });

    setIntersecting(false);
    // Give a potential (unwanted) comments request a chance to fire.
    await delay(0);

    expect(fetchMock.callHistory.calls()).toHaveLength(0);
    expect(result.current.unresolvedCommentsCount).toBe(0);
    expect(result.current.shouldShowMenus).toBeFalsy();
  });

  it("fetches the unresolved comments count and shows menus when in viewport", async () => {
    const { result } = setup({
      comments: [
        createMockComment({ child_target_id: NODE_ID }),
        createMockComment({ child_target_id: NODE_ID, is_resolved: true }),
        createMockComment({ child_target_id: "another-node" }),
      ],
    });

    setIntersecting(true);

    await waitFor(() => {
      expect(result.current.unresolvedCommentsCount).toBe(1);
    });
    expect(result.current.shouldShowMenus).toBe(true);
  });
});

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

  it("returns false (without throwing) for a stale out-of-range position", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hi")]),
    ]);
    const stalePos = doc.content.size + 100;
    expect(() =>
      isTopLevel(buildArgs(buildEditor(doc), () => stalePos)),
    ).not.toThrow();
    expect(isTopLevel(buildArgs(buildEditor(doc), () => stalePos))).toBe(false);
  });

  it("returns false (without throwing) for a negative position", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hi")]),
    ]);
    expect(isTopLevel(buildArgs(buildEditor(doc), () => -1))).toBe(false);
  });

  it("returns false when editor or getPos is missing", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hi")]),
    ]);
    expect(isTopLevel(buildArgs(null, () => 0))).toBe(false);
    expect(isTopLevel(buildArgs(buildEditor(doc), null))).toBe(false);
  });

  it("returns false when getPos returns undefined", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hi")]),
    ]);
    expect(isTopLevel(buildArgs(buildEditor(doc), () => undefined))).toBe(
      false,
    );
    expect(
      isTopLevel(buildArgs(buildEditor(doc), () => undefined as never)),
    ).toBe(false);
  });
});
