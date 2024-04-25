import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("ExpressionWidgetInfo (EE without token)", () => {
  it("should show a help link when `show-metabase-links: true`", async () => {
    setup({ showMetabaseLinks: true });

    expect(
      screen.getByRole("link", { name: "Open expressions documentation" }),
    ).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/query-builder/expressions.html",
    );
    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      screen.getByText(
        "You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.",
      ),
    ).toBeInTheDocument();
  });

  it("should show a help link when `show-metabase-links: false`", async () => {
    setup({ showMetabaseLinks: false });

    expect(
      screen.getByRole("link", { name: "Open expressions documentation" }),
    ).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/query-builder/expressions.html",
    );
    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      screen.getByText(
        "You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.",
      ),
    ).toBeInTheDocument();
  });
});
