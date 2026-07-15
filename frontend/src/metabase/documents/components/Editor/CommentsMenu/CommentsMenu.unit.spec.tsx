import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import { CommentsMenu } from "./CommentsMenu";

const defaultStyle = { top: 0, left: 0 };

function setup(initialRoute: string) {
  renderWithProviders(
    <Route
      path="*"
      component={() => (
        <CommentsMenu
          active={false}
          childTargetId="block-123"
          show
          style={defaultStyle}
          unresolvedCommentsCount={0}
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
  it("replaces an existing /comments/ path segment when building the link and preserves existing search params", () => {
    setup("/document/entity-1/comments/other-block?timeline=5");

    const href = getCommentLink().getAttribute("href") ?? "";
    expect(href).toContain("/document/entity-1/comments/block-123");
    expect(href).not.toContain("/comments/other-block");
    expect(href).toContain("timeline=5");
  });

  it("does not add a trailing ? when there are no search params", () => {
    setup("/document/entity-1");

    const href = getCommentLink().getAttribute("href") ?? "";
    expect(href).toBe("/document/entity-1/comments/block-123");
  });
});
