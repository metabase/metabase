import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { CommentsMenu } from "./CommentsMenu";

const defaultStyle = { top: 0, left: 0 };

function setup(unresolvedCommentsCount: number, initialRoute: string) {
  renderWithProviders(
    <Route
      path="*"
      component={() => (
        <CommentsMenu
          active={false}
          childTargetId="block-123"
          show
          style={defaultStyle}
          unresolvedCommentsCount={unresolvedCommentsCount}
        />
      )}
    />,
    { withRouter: true, initialRoute },
  );
}

function getCommentLink() {
  return screen.getByRole("link", { name: "Comments" });
}

describe("CommentsMenu", () => {
  it("adds new=true to the comment link when there are no unresolved comments", () => {
    setup(0, "/document/entity-1?timeline=5");

    const href = getCommentLink().getAttribute("href") ?? "";
    expect(href).toContain("/document/entity-1/comments/block-123");
    expect(href).toContain("timeline=5");
    expect(href).toContain("new=true");
  });

  it("preserves existing search params without new=true when there are unresolved comments", () => {
    setup(2, "/document/entity-1?timeline=5");

    const href = getCommentLink().getAttribute("href") ?? "";
    expect(href).toContain("/document/entity-1/comments/block-123");
    expect(href).toContain("timeline=5");
    expect(href).not.toContain("new=true");
  });

  it("replaces an existing /comments/ path segment when building the link", () => {
    setup(0, "/document/entity-1/comments/other-block?timeline=5");

    const href = getCommentLink().getAttribute("href") ?? "";
    expect(href).toContain("/document/entity-1/comments/block-123");
    expect(href).not.toContain("/comments/other-block");
    expect(href).toContain("timeline=5");
    expect(href).toContain("new=true");
  });

  it("does not add a trailing ? when there are no search params", () => {
    setup(2, "/document/entity-1");

    const href = getCommentLink().getAttribute("href") ?? "";
    expect(href).toBe("/document/entity-1/comments/block-123");
  });
});
