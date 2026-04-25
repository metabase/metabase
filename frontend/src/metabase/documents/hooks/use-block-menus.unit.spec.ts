import { renderHook } from "@testing-library/react";
import type { Editor, NodeViewProps } from "@tiptap/core";

import { skipToken, useListCommentsQuery } from "metabase/api";

import { useBlockMenus } from "./use-block-menus";

const mockUseNodeInViewport = jest.fn();

jest.mock("metabase/documents/hooks/use-node-in-viewport", () => ({
  useNodeInViewport: () => mockUseNodeInViewport(),
}));

jest.mock("metabase/api", () => ({
  skipToken: Symbol("skipToken"),
  useListCommentsQuery: jest.fn().mockReturnValue({
    data: undefined,
    unresolvedCommentsCount: 0,
  }),
}));

jest.mock("metabase/comments/utils", () => ({
  getTargetChildCommentThreads: jest.fn().mockReturnValue([]),
}));

jest.mock("metabase/documents/components/Editor/CommentsMenu", () => ({
  getUnresolvedComments: jest.fn().mockReturnValue([]),
}));

jest.mock("metabase/documents/selectors", () => ({
  getChildTargetId: jest.fn().mockReturnValue(null),
  getCurrentDocument: jest.fn().mockReturnValue({ id: 1 }),
  getHoveredChildTargetId: jest.fn().mockReturnValue(null),
}));

jest.mock("metabase/documents/utils/api", () => ({
  getListCommentsQuery: jest.fn().mockReturnValue({ document_id: 1 }),
}));

jest.mock("metabase/documents/utils/editorNodeUtils", () => ({
  isTopLevel: jest.fn().mockReturnValue(true),
}));

jest.mock("metabase/lib/dom", () => ({
  isWithinIframe: jest.fn().mockReturnValue(false),
}));

jest.mock("metabase/lib/redux", () => ({
  useSelector: (selector: () => unknown) => selector(),
}));

jest.mock("metabase/lib/urls", () => ({
  documentWithAnchor: jest.fn().mockReturnValue("/document/1/anchor/test-id"),
}));

jest.mock("@floating-ui/react", () => ({
  autoUpdate: jest.fn(),
  useFloating: jest.fn().mockReturnValue({
    refs: {
      setReference: jest.fn(),
      setFloating: jest.fn(),
    },
    floatingStyles: {},
  }),
}));

const mockNode = {
  attrs: { _id: "test-id" },
  textContent: "test content",
} as unknown as NodeViewProps["node"];

const mockEditor = {} as Editor;
const mockGetPos = jest.fn().mockReturnValue(0);

describe("useBlockMenus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useListCommentsQuery as jest.Mock).mockReturnValue({
      unresolvedCommentsCount: 0,
    });
  });

  it("passes skipToken to useListCommentsQuery when off-screen", () => {
    mockUseNodeInViewport.mockReturnValue({
      ref: jest.fn(),
      isInViewport: false,
    });

    renderHook(() =>
      useBlockMenus({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
      }),
    );

    expect(useListCommentsQuery).toHaveBeenCalledWith(
      skipToken,
      expect.any(Object),
    );
  });

  it("passes real query to useListCommentsQuery when in viewport", () => {
    mockUseNodeInViewport.mockReturnValue({
      ref: jest.fn(),
      isInViewport: true,
    });

    renderHook(() =>
      useBlockMenus({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
      }),
    );

    expect(useListCommentsQuery).toHaveBeenCalledWith(
      { document_id: 1 },
      expect.any(Object),
    );
  });

  it("shouldShowMenus is false when off-screen", () => {
    mockUseNodeInViewport.mockReturnValue({
      ref: jest.fn(),
      isInViewport: false,
    });

    const { result } = renderHook(() =>
      useBlockMenus({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
      }),
    );

    expect(result.current.shouldShowMenus).toBeFalsy();
  });
});
