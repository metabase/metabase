import { screen, within } from "@testing-library/react";

import { getBrokenUpTextMatcher } from "__support__/ui";

import { setup } from "./setup";

describe("HelpText (OSS)", () => {
  it("should render expression function info, example and documentation link", async () => {
    await setup({
      enclosingFunction: {
        name: "concat",
      },
    });

    expect(
      screen.getByText('concat([Last Name], ", ", [First Name])'),
    ).toBeInTheDocument();

    expect(
      screen.getByText(getBrokenUpTextMatcher("concat(value1, value2, …)")),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Combine two or more strings of text together."),
    ).toBeInTheDocument();

    const link = screen.getByRole("link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/query-builder/expressions/concat.html",
    );
  });

  it("should handle expression function without arguments", async () => {
    await setup({
      enclosingFunction: {
        name: "cum-count",
      },
    });

    expect(screen.getAllByText("CumulativeCount")).toHaveLength(2);

    const exampleCodeEl = screen.getByTestId(
      "expression-helper-popover-structure",
    );
    expect(
      within(exampleCodeEl).getByText("CumulativeCount"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("The additive total of rows across a breakout."),
    ).toBeInTheDocument();
  });

  it("should render function arguments", async () => {
    const { helpText } = await setup({
      enclosingFunction: {
        name: "concat",
      },
    });

    const argumentsBlock = screen.getByTestId(
      "expression-helper-popover-arguments",
    );

    helpText?.args?.forEach(({ name, description }) => {
      const expectedName = name === "…" ? "…" : name;
      expect(
        within(argumentsBlock).getByText(expectedName),
      ).toBeInTheDocument();
      expect(within(argumentsBlock).getByText(description)).toBeInTheDocument();
    });
  });

  describe("Metabase links", () => {
    it("should show a help link when `show-metabase-links: true`", async () => {
      await setup({
        enclosingFunction: {
          name: "concat",
        },
        showMetabaseLinks: true,
      });

      expect(
        screen.getByRole("img", { name: "reference icon" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Learn more")).toBeInTheDocument();
    });

    it("should show a help link when `show-metabase-links: false`", async () => {
      await setup({
        enclosingFunction: {
          name: "concat",
        },
        showMetabaseLinks: false,
      });

      expect(
        screen.getByRole("img", { name: "reference icon" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Learn more")).toBeInTheDocument();
    });
  });
});
