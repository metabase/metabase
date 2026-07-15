import userEvent from "@testing-library/user-event";

import { setupCommentEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { initialState as documentsInitialState } from "metabase/documents/documents.slice";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockDocument } from "metabase-types/api/mocks";

import { CommentsSidesheet } from "./CommentsSidesheet";

const mockCloseCommentSidebar = jest.fn();
const mockOpenCommentSidebar = jest.fn();

jest.mock("metabase/documents/hooks/use-document-state", () => ({
  useDocumentState: () => ({
    openCommentSidebar: mockOpenCommentSidebar,
    closeCommentSidebar: mockCloseCommentSidebar,
  }),
}));

const mockUseLocation = jest.fn();

jest.mock("react-use", () => ({
  ...jest.requireActual("react-use"),
  useLocation: () => mockUseLocation(),
}));

const document = createMockDocument({ id: 1 });

function setup({
  pathname = "/document/1/comments/block-abc",
  search = "",
  childTargetId = "block-abc",
  initialRoute = "/document/1/comments/block-abc",
}: {
  pathname?: string;
  search?: string;
  childTargetId?: string;
  initialRoute?: string;
} = {}) {
  mockUseLocation.mockReturnValue({
    pathname,
    search,
    hash: "",
  });

  setupCommentEndpoints([], {
    target_type: "document",
    target_id: document.id,
  });

  const state = createMockState({
    documents: {
      ...documentsInitialState,
      currentDocument: document,
    },
  });

  const { history, ...utils } = renderWithProviders(
    <Route
      path="*"
      component={() => <CommentsSidesheet params={{ childTargetId }} />}
    />,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: state,
    },
  );

  if (!history) {
    throw new Error("Expected history when rendering with withRouter");
  }

  return { history, ...utils };
}

describe("CommentsSidesheet", () => {
  beforeEach(() => {
    mockCloseCommentSidebar.mockClear();
    mockOpenCommentSidebar.mockClear();
  });

  it("closes to the parent path and preserves search params", async () => {
    const { history } = setup({
      pathname: "/document/1/comments/block-abc",
      search: "?foo=bar",
      initialRoute: "/document/1/comments/block-abc?foo=bar",
    });

    const sidebar = screen.getByTestId("comments-sidebar");
    await userEvent.click(
      await within(sidebar).findByRole("button", { name: "Close" }),
    );

    expect(mockCloseCommentSidebar).toHaveBeenCalled();
    expect(history.getCurrentLocation()).toMatchObject({
      pathname: "/document/1",
      search: "?foo=bar",
    });
  });
});
