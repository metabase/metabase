import { renderHook } from "@testing-library/react";

import {
  createMockNodeViewProps,
  createMockProseMirrorNode,
} from "metabase/rich_text_editing/tiptap/extensions/MetabotEmbed/__support__/node-view-mocks";

import { useBlockMenus } from "./use-block-menus";

const mockUseNodeInViewport = jest.fn();
const mockUseUnresolvedCommentsCount = jest.fn();

jest.mock("metabase/documents/hooks/use-node-in-viewport", () => ({
  useNodeInViewport: () => mockUseNodeInViewport(),
}));

jest.mock("metabase/documents/hooks/use-unresolved-comments-count", () => ({
  useUnresolvedCommentsCount: (...args: unknown[]) =>
    mockUseUnresolvedCommentsCount(...args),
}));

jest.mock("metabase/documents/selectors", () => ({
  getChildTargetId: () => null,
  getCurrentDocument: () => ({ id: 1 }),
  getHoveredChildTargetId: () => null,
}));

jest.mock("metabase/documents/utils/editorNodeUtils", () => ({
  isTopLevel: () => true,
}));

jest.mock("metabase/redux", () => ({
  useSelector: (selector: () => unknown) => selector(),
}));

const nodeViewProps = createMockNodeViewProps({
  node: createMockProseMirrorNode({
    attrs: { _id: "test-id" },
    textContent: "test content",
  }),
});

function renderBlockMenus() {
  return renderHook(() =>
    useBlockMenus({
      node: nodeViewProps.node,
      editor: nodeViewProps.editor,
      getPos: nodeViewProps.getPos,
    }),
  );
}

describe("useBlockMenus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUnresolvedCommentsCount.mockReturnValue(0);
  });

  it("skips the unresolved-comments query when off-screen", () => {
    mockUseNodeInViewport.mockReturnValue({
      ref: jest.fn(),
      isInViewport: false,
    });

    renderBlockMenus();

    expect(mockUseUnresolvedCommentsCount).toHaveBeenCalledWith("test-id", {
      skip: true,
    });
  });

  it("runs the unresolved-comments query when in viewport", () => {
    mockUseNodeInViewport.mockReturnValue({
      ref: jest.fn(),
      isInViewport: true,
    });

    renderBlockMenus();

    expect(mockUseUnresolvedCommentsCount).toHaveBeenCalledWith("test-id", {
      skip: false,
    });
  });

  it("does not show menus when off-screen", () => {
    mockUseNodeInViewport.mockReturnValue({
      ref: jest.fn(),
      isInViewport: false,
    });

    const { result } = renderBlockMenus();

    expect(result.current.shouldShowMenus).toBeFalsy();
  });
});
