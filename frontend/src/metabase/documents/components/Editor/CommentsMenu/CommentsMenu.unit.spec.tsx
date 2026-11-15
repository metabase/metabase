import { renderWithProviders, screen } from "__support__/ui";
import { DocumentEditorHostProvider } from "metabase/documents/components/Editor/DocumentEditorHost";
import { Route } from "metabase/router";

import { CommentsMenu } from "./CommentsMenu";

// The global style mock has no class names; these let the test see whether the
// menu is forced visible.
jest.mock("./CommentsMenu.module.css", () => ({
  commentsMenu: "commentsMenu",
  visible: "visible",
}));

const defaultStyle = { top: 0, left: 0 };

interface SetupOpts {
  initialRoute?: string;
  show?: boolean;
  unresolvedCommentsCount?: number;
}

function setup({
  initialRoute = "/document/entity-1",
  show = true,
  unresolvedCommentsCount = 0,
}: SetupOpts = {}) {
  renderWithProviders(
    <Route
      path="*"
      element={
        <DocumentEditorHostProvider>
          <CommentsMenu
            active={false}
            childTargetId="block-123"
            show={show}
            style={defaultStyle}
            unresolvedCommentsCount={unresolvedCommentsCount}
          />
        </DocumentEditorHostProvider>
      }
    />,
    { withRouter: true, initialRoute },
  );
}

function getCommentLink() {
  return screen.getByRole("link", { name: "Comments" });
}

describe("CommentsMenu", () => {
  it("replaces an existing /comments/ path segment when building the link and preserves existing search params", () => {
    setup({
      initialRoute: "/document/entity-1/comments/other-block?timeline=5",
    });

    const href = getCommentLink().getAttribute("href") ?? "";
    expect(href).toContain("/document/entity-1/comments/block-123");
    expect(href).not.toContain("/comments/other-block");
    expect(href).toContain("timeline=5");
  });

  it("does not add a trailing ? when there are no search params", () => {
    setup({ initialRoute: "/document/entity-1" });

    const href = getCommentLink().getAttribute("href") ?? "";
    expect(href).toBe("/document/entity-1/comments/block-123");
  });

  it("stays visible with the unresolved comments count when the block is not hovered", () => {
    setup({ show: false, unresolvedCommentsCount: 4 });

    expect(getCommentLink()).toHaveTextContent("4");
    expect(screen.getByTestId("comments-menu")).toHaveClass("visible");
  });

  it("is hidden without a count when there are no unresolved comments and the block is not hovered", () => {
    setup({ show: false, unresolvedCommentsCount: 0 });

    expect(getCommentLink()).not.toHaveTextContent(/\d/);
    expect(screen.getByTestId("comments-menu")).not.toHaveClass("visible");
  });
});
