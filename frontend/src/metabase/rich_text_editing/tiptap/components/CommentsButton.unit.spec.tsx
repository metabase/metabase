import { renderWithProviders, screen } from "__support__/ui";

import { CommentsButton } from "./CommentsButton";

describe("CommentsButton", () => {
  it("shows the unresolved comments count", () => {
    renderWithProviders(<CommentsButton unresolvedCommentsCount={4} />);

    expect(screen.getByRole("button", { name: "Comments" })).toHaveTextContent(
      "4",
    );
    expect(screen.getByLabelText("comment icon")).toBeInTheDocument();
  });

  it("shows no count when there are no unresolved comments", () => {
    renderWithProviders(<CommentsButton unresolvedCommentsCount={0} />);

    expect(screen.getByLabelText("add_comment icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comments" })).toHaveTextContent(
      /^$/,
    );
  });
});
