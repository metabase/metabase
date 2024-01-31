import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";
import { setup as baseSetup } from "./setup";
import type { SetupOpts } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { whitelabel: true },
    ...opts,
  });
}

describe("ExpressionWidgetInfo (EE with token)", () => {
  it("should show a help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    expect(
      screen.getByRole("link", { name: "Open expressions documentation" }),
    ).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/query-builder/expressions.html",
    );
    userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      screen.getByText(
        "You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.",
      ),
    ).toBeInTheDocument();
  });

  it("should not show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(
      screen.queryByRole("link", { name: "Open expressions documentation" }),
    ).not.toBeInTheDocument();
    userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      screen.getByText(
        "You can reference columns here in functions or equations, like: floor([Price] - [Discount]).",
      ),
    ).toBeInTheDocument();
  });
});
