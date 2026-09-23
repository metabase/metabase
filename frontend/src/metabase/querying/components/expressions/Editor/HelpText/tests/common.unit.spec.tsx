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
      expressionMode: "aggregation",
    });

    const exampleCodeEl = screen.getByTestId(
      "expression-helper-popover-structure",
    );
    expect(
      await within(exampleCodeEl).findByText("CumulativeCount()"),
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

    // Wait for the async-formatted example so HighlightExpressionParts
    // settles before the test ends.
    await screen.findByText('concat([Last Name], ", ", [First Name])');

    const argumentsBlock = screen.getByTestId(
      "expression-helper-popover-arguments",
    );

    helpText?.args?.forEach(({ name, description }) => {
      expect(
        within(argumentsBlock).getByTestId(`arg-${name}-name`),
      ).toHaveTextContent(name);

      expect(
        within(argumentsBlock).getByTestId(`arg-${name}-description`) ?? "",
      ).toHaveTextContent(
        description?.replaceAll("`", "").replaceAll("$", "") ?? "",
      );
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

  describe("named arguments", () => {
    const promptSetup = {
      enclosingFunction: { name: "prompt" as const },
      allowTransformOnlyFunctions: true,
      features: ["transforms/python" as const],
    };

    it("should list named arguments in the signature and descriptions", async () => {
      const { helpText } = await setup(promptSetup);

      expect(
        screen.getByText(
          getBrokenUpTextMatcher("prompt(text, …, returnType, jsonSchema)"),
        ),
      ).toBeInTheDocument();

      const argumentsBlock = screen.getByTestId(
        "expression-helper-popover-arguments",
      );

      helpText?.namedArgs.forEach(({ name, description }) => {
        expect(
          within(argumentsBlock).getByTestId(`arg-${name}-name`),
        ).toHaveTextContent(name);
        expect(
          within(argumentsBlock).getByTestId(`arg-${name}-description`),
        ).toHaveTextContent(description);
      });
    });

    it("should show a named argument in the example", async () => {
      await setup(promptSetup);

      await waitFor(() => {
        expect(screen.getByTestId("helptext-example")).toHaveTextContent(
          'returnType => "integer"',
        );
      });
    });

    it("should highlight the named argument instead of the rest argument", async () => {
      await setup({
        ...promptSetup,
        enclosingFunction: {
          name: "prompt",
          arg: { index: 3, named: "returnType" },
        },
      });

      const structure = screen.getByTestId(
        "expression-helper-popover-structure",
      );

      expect(within(structure).getByText("returnType")).toHaveAttribute(
        "data-active",
      );
      expect(within(structure).getByText("…")).not.toHaveAttribute(
        "data-active",
      );
      expect(within(structure).getByText("jsonSchema")).not.toHaveAttribute(
        "data-active",
      );
    });

    it("should still highlight the rest argument for extra positional arguments", async () => {
      await setup({
        ...promptSetup,
        enclosingFunction: {
          name: "prompt",
          arg: { index: 3 },
        },
      });

      const structure = screen.getByTestId(
        "expression-helper-popover-structure",
      );

      expect(within(structure).getByText("…")).toHaveAttribute("data-active");
      expect(within(structure).getByText("returnType")).not.toHaveAttribute(
        "data-active",
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

      // Wait for the async-formatted example so HighlightExpressionParts
      // settles before the test ends.
      await screen.findByText('concat([Last Name], ", ", [First Name])');

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

      // Wait for the async-formatted example so HighlightExpressionParts
      // settles before the test ends.
      await screen.findByText('concat([Last Name], ", ", [First Name])');

      expect(
        screen.getByRole("img", { name: "reference icon" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Learn more")).toBeInTheDocument();
    });
  });
});
