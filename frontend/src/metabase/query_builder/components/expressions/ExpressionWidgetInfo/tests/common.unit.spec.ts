import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";
import { setup } from "./setup";

describe("ExpressionWidgetInfo (OSS)", () => {
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

  it("should show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

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
});
