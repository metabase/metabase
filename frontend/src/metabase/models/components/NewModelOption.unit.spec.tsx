import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { NewModelOption } from "./NewModelOption";

const defaultProps = {
  image: "app/img/sql_illustration",
  title: "Use a native query",
  description: "Fall back to SQL.",
  to: "/model/new/native",
};

const setup = (props = {}) =>
  renderWithProviders(
    <Route
      path="*"
      component={() => <NewModelOption {...defaultProps} {...props} />}
    />,
    { withRouter: true },
  );

describe("NewModelOption", () => {
  it("renders the title and description", () => {
    setup();

    expect(
      screen.getByRole("heading", { name: "Use a native query" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fall back to SQL.")).toBeInTheDocument();
  });

  it("links to the provided target", () => {
    setup();

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/model/new/native",
    );
  });

  it("renders the image with src, srcSet, and the provided width", () => {
    setup({ width: 180 });

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "app/img/sql_illustration.png");
    expect(img).toHaveAttribute("srcset", "app/img/sql_illustration@2x.png 2x");
    expect(img).toHaveAttribute("width", "180");
  });

  it("falls back to the default image width when none is provided", () => {
    setup();

    expect(screen.getByRole("img")).toHaveAttribute("width", "210");
  });
});
