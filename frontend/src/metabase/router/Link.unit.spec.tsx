import { renderWithProviders, screen } from "__support__/ui";

import { Link } from "./Link";
import { Route } from "./react-router";

describe("router/Link", () => {
  it("re-exports the to-based Link", () => {
    const Host = () => <Link to="/foo">go</Link>;
    renderWithProviders(<Route path="*" component={Host} />, {
      withRouter: true,
    });

    expect(screen.getByRole("link", { name: "go" })).toHaveAttribute(
      "href",
      "/foo",
    );
  });
});
