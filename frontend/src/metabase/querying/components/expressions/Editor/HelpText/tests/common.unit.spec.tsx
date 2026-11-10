import { fireEvent, screen, within } from "@testing-library/react";

import { setup } from "./setup";

const DOCS_URL =
  "https://www.metabase.com/docs/latest/questions/query-builder/expressions-list.html";

describe("HelpText (OSS)", () => {
  it("should show the description, example, structure and docs link", async () => {
    await setup({
      enclosingFunction: {
        name: "concat",
      },
    });

    expect(
      screen.getByText("Joins two or more pieces of text together."),
    ).toBeInTheDocument();
    expect(screen.getByText("e.g.")).toBeInTheDocument();
    expect(screen.getByTestId("helptext-example")).toHaveTextContent(
      'concat([Last Name], ", ", [First Name])',
    );
    expect(
      screen.getByTestId("expression-helper-popover-structure"),
    ).toHaveTextContent("concat(value1, value2, …)");
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      `${DOCS_URL}#concat`,
    );
  });

  it("should keep a long example on one line", async () => {
    await setup({
      enclosingFunction: {
        name: "does-not-contain",
      },
    });

    expect(screen.getByTestId("helptext-example")).toHaveTextContent(
      'doesNotContain([Title], "Small", "Medium", "case-insensitive")',
      { normalizeWhitespace: false },
    );
  });

  it("should link to the function's section of the docs, in a new tab, without the click reaching the editor (metabase#54638)", async () => {
    await setup({
      enclosingFunction: {
        name: "case",
      },
    });

    const onDocumentMouseDown = jest.fn();
    document.addEventListener("mousedown", onDocumentMouseDown);

    const link = screen.getByRole("link", { name: "Docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("href", `${DOCS_URL}#case`);

    fireEvent.mouseDown(link);
    expect(onDocumentMouseDown).not.toHaveBeenCalled();
    // `false` when a handler calls `preventDefault()`, which cancels navigation
    expect(fireEvent.click(link)).toBe(true);

    document.removeEventListener("mousedown", onDocumentMouseDown);
  });

  it("should handle a function without arguments", async () => {
    await setup({
      enclosingFunction: {
        name: "cum-count",
      },
      expressionMode: "aggregation",
    });

    expect(
      screen.getByTestId("expression-helper-popover-structure"),
    ).toHaveTextContent("CumulativeCount()");
    expect(
      screen.getByText(
        "Counts rows as a running total across groups, such as months.",
      ),
    ).toBeInTheDocument();
  });

  it("should only show the structure in the structure variant", async () => {
    await setup({
      enclosingFunction: {
        name: "concat",
      },
      variant: "structure",
    });

    expect(
      screen.getByTestId("expression-helper-popover-structure"),
    ).toHaveTextContent("concat(value1, value2, …)");
    expect(screen.queryByTestId("expression-helper")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each([
    [0, "column"],
    [2, "end"],
  ])(
    "should mark the value at position %s as the current one",
    async (index, name) => {
      await setup({
        enclosingFunction: {
          name: "between",
          arg: { index },
        },
      });

      const structure = screen.getByTestId(
        "expression-helper-popover-structure",
      );
      expect(within(structure).getByText(name)).toHaveAttribute("data-active");
      expect(within(structure).getByText("start")).not.toHaveAttribute(
        "data-active",
      );
    },
  );

  it("should mark the repeated value as current past the last named one", async () => {
    await setup({
      enclosingFunction: {
        name: "concat",
        arg: { index: 4 },
      },
    });

    const structure = screen.getByTestId("expression-helper-popover-structure");
    expect(within(structure).getByText("…")).toHaveAttribute("data-active");
  });

  describe("Metabase links", () => {
    it.each([true, false])(
      "should show the docs link in OSS when `show-metabase-links: %s`",
      async (showMetabaseLinks) => {
        await setup({
          enclosingFunction: {
            name: "concat",
          },
          showMetabaseLinks,
        });

        expect(screen.getByRole("link", { name: "Docs" })).toBeInTheDocument();
      },
    );
  });
});
