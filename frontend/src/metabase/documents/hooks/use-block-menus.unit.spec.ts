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

import { useBlockMenus } from "./use-block-menus";

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
