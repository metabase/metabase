import { screen, within } from "@testing-library/react";

import { getBrokenUpTextMatcher, waitFor } from "__support__/ui";

import { setup } from "./setup";

describe("HelpText (OSS)", () => {
  it("should render expression function info, example and documentation link", async () => {
    await setup({
      enclosingFunction: {
        name: "concat",
      },
    });

    expect(
      await screen.findByText('concat([Last Name], ", ", [First Name])'),
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

    const exampleCodeEl = screen.getByTestId(
      "expression-helper-popover-structure",
    );
    expect(
      await within(exampleCodeEl).findByText("CumulativeCount"),
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

  it("should render long examples on multiple lines", async () => {
    await setup({
      enclosingFunction: {
        name: "does-not-contain",
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("helptext-example")).toHaveTextContent(
        `
          doesNotContain(
            [Title],
            "Small",
            "Medium",
            "case-insensitive"
          )
        `
          // textContent collapses whitespace to a single space
          .replace(/\s+/g, " ")
          .trim(),
      );
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
