jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  ORDERS_ID,
  PRODUCTS_ID,
  REVIEWS_ID,
} from "metabase-types/api/mocks/presets";

import {
  blurEditor,
  getCompletionLabels,
  getEditorValue,
  getSelectedCompletionLabel,
  pasteText,
  pressKey,
  selectRange,
  setCursorPosition,
  setup,
  typeText,
  waitForCompletions,
  waitForValidationDebounce,
} from "./setup";

function createOrdersQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  });
}

describe("ExpressionWidget > completion", () => {
  it("should suggest columns but not arithmetic operators", async () => {
    await setup();

    await typeText("[Pri");
    expect(await waitForCompletions()).toContain("Price");

    await typeText("ce] ");
    expect(getEditorValue()).toBe("[Price] ");
    await waitFor(() =>
      expect(
        getCompletionLabels().filter((label) => /^\s*[-+*/](\s|$)/.test(label)),
      ).toEqual([]),
    );
  });

  it("should insert a function template when accepting a function suggestion", async () => {
    await setup();

    await typeText("bet");
    await waitForCompletions();
    await pressKey("Enter");
    expect(getEditorValue()).toBe("between(column, start, end)");
  });

  it("should insert a function without arguments with empty parentheses", async () => {
    await setup();

    await typeText("now");
    await waitForCompletions();
    await pressKey("Enter");
    expect(getEditorValue()).toBe("now()");
  });

  it("should not show suggestions once the editor loses focus (metabase#31643)", async () => {
    await setup({ expressionMode: "aggregation" });

    await typeText("Count");
    expect(await waitForCompletions()).toContain("Count");
    await pressKey("Enter");
    await blurEditor();

    await waitFor(() =>
      expect(
        screen.queryByTestId("custom-expression-editor-suggestions"),
      ).not.toBeInTheDocument(),
    );
  });

  it("should not show an error while a snippet is still active", async () => {
    await setup();

    await typeText("conca");
    await waitForCompletions();
    await pressKey("Tab");
    expect(getEditorValue()).toBe("concat(value1, value2)");

    await waitForValidationDebounce();
    expect(screen.queryByText(/Unknown column/)).not.toBeInTheDocument();

    await pressKey("Tab");
    expect(await screen.findByText(/Unknown column/)).toBeInTheDocument();
  });

  it("should suggest a custom column that renames another custom column", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          expressions: [
            {
              name: "Foo",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "literal", value: 1 },
                  { type: "literal", value: 1 },
                ],
              },
            },
            { name: "Bar", value: { type: "column", name: "Foo" } },
          ],
        },
      ],
    });
    await setup({ query });

    await typeText("[Ba");
    expect(await waitForCompletions()).toContain("Bar");
  });

  it("should suggest an aggregation that renames another aggregation", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            {
              name: "Foo",
              value: {
                type: "operator",
                operator: "sum",
                args: [{ type: "column", name: "TOTAL" }],
              },
            },
            { name: "Bar", value: { type: "column", name: "Foo" } },
          ],
        },
      ],
    });
    await setup({ query, expressionMode: "aggregation" });

    await typeText("[Ba");
    expect(await waitForCompletions()).toContain("Bar");
  });

  it("should suggest non-numeric columns inside Distinct (metabase#13469)", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: REVIEWS_ID } }],
    });
    await setup({ query, expressionMode: "aggregation" });

    await typeText("Distinct([R");
    expect(await waitForCompletions()).toContain("Reviewer");
  });

  it("should not eat up the following characters when applying a suggestion (metabase#49882)", async () => {
    await setup({ query: createOrdersQuery() });

    await pasteText('case([Total] > 200, , "X")');
    await setCursorPosition("case([Total] > 200, ".length);
    await typeText("[tot");
    await waitForCompletions();
    await pressKey("Enter");

    expect(getEditorValue()).toBe('case([Total] > 200, [Total], "X")');
    expect(
      screen.queryByText("Expecting a closing parenthesis"),
    ).not.toBeInTheDocument();
  });

  it("should update the selected suggestion when the suggestion list changes (metabase#49882)", async () => {
    await setup({ query: createOrdersQuery() });

    await typeText("[Produ");
    await waitForCompletions();
    await pressKey("ArrowDown", { times: 5 });
    await waitFor(() =>
      expect(getSelectedCompletionLabel()).toBe("Product → Rating"),
    );
    expect(await pressKey("Tab")).toBe(false);

    expect(getEditorValue()).toBe("[Product → Rating]");
    expect(screen.getByTestId("expression-name")).not.toHaveFocus();
  });

  it("should keep the characters after an unclosed identifier when applying a suggestion (metabase#50925)", async () => {
    const source = "case([ID] = 1, [Price] * 1.21, [Price])";
    await setup();

    await pasteText(source);
    await setCursorPosition(source.length - "[Price])".length);
    await typeText(" [Pr");
    await waitForCompletions();
    await pressKey("Enter");
    expect(getEditorValue()).toBe(
      "case([ID] = 1, [Price] * 1.21,  [Price][Price])",
    );
  });

  it("should keep the whitespace after an unclosed identifier when applying a suggestion (metabase#50925)", async () => {
    const source = "case([ID] = 1, [Price] * 1.21, [Price])";
    await setup();

    await pasteText(source);
    await setCursorPosition(source.length - " [Price])".length);
    await typeText(" [Pr");
    await waitForCompletions();
    await pressKey("Enter");
    expect(getEditorValue()).toBe(
      "case([ID] = 1, [Price] * 1.21, [Price] [Price])",
    );
  });
});

describe("ExpressionWidget > keyboard", () => {
  it("should not leave the editor with the Tab key", async () => {
    await setup({ query: createOrdersQuery() });

    await typeText("[Tot");
    await waitForCompletions();
    await pressKey("Enter");
    expect(getEditorValue()).toBe("[Total]");

    // CodeMirror prevents the default action, so focus stays in the editor
    expect(await pressKey("Tab")).toBe(false);
    expect(getEditorValue()).toBe("[Total]  ");
    expect(screen.getByTestId("expression-name")).not.toHaveFocus();
  });
});

describe("ExpressionWidget > validation", () => {
  it("should accept a custom column named like an aggregation in a later stage (metabase#21513)", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: PRODUCTS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [{ type: "column", name: "CATEGORY" }],
        },
        {},
      ],
    });
    const { onChangeClause } = await setup({ query, stageIndex: 1 });

    await typeText("[Count] * 2");
    await typeName("Double Count");
    const doneButton = screen.getByRole("button", { name: "Done" });
    await waitFor(() => expect(doneButton).toBeEnabled());
    expect(onChangeClause).not.toHaveBeenCalled();
  });

  it("should keep an expression that a paste makes invalid and show the error (metabase#49882, metabase#15892)", async () => {
    const source =
      'case([Tax] > 1, case([Total] > 200, [Total], "Nothing"), [Tax])';
    await setup({ query: createOrdersQuery() });

    await pasteText(source);
    // cut the last `[Tax]`
    const taxStart = source.lastIndexOf("[Tax]");
    await selectRange(taxStart, taxStart + "[Tax]".length);
    await pasteText("");
    // and paste it before the inner `case`
    await setCursorPosition("case([Tax] > 1,".length);
    await pasteText("[Tax]");

    expect(getEditorValue()).toBe(
      'case([Tax] > 1,[Tax] case([Total] > 200, [Total], "Nothing"), )',
    );
    expect(
      await screen.findByText("Expecting operator but got case instead"),
    ).toBeInTheDocument();
    expect(getEditorValue()).toBe(
      'case([Tax] > 1,[Tax] case([Total] > 200, [Total], "Nothing"), )',
    );
  });

  it("should show an error for a multi-argument function with too few arguments and survive a name edit (metabase#53682)", async () => {
    await setup();

    await pasteText("contains([Category])");
    await blurEditor();
    expect(
      await screen.findByText("Function contains expects at least 2 arguments"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

    await typeName("Name");
    expect(screen.getByTestId("expression-editor")).toBeInTheDocument();
    expect(screen.getByTestId("expression-name")).toHaveValue("Name");
    expect(
      screen.getByText("Function contains expects at least 2 arguments"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
  });
});

async function typeName(name: string) {
  await userEvent.type(screen.getByTestId("expression-name"), name);
}
