jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type { Field } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PRODUCTS_ID,
  REVIEWS_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersTableDatasetColumns,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  blurEditor,
  clickCompletion,
  createProductsQuery,
  focusEditor,
  getCompletionLabels,
  getEditorValue,
  getEditorView,
  getSelectedCompletionLabel,
  pasteText,
  pressKey,
  selectRange,
  setCursorPosition,
  setup,
  typeText,
  waitForCompletions,
  waitForHelpTextExample,
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

  it("should be possible to fill in snippet arguments after validation runs (metabase#55164)", async () => {
    await setup({ query: createOrdersQuery() });

    await typeText("coalesc");
    await waitForCompletions();
    await pressKey("Tab");
    expect(getEditorValue()).toBe("coalesce(value1, value2)");

    await waitForValidationDebounce();

    await typeText("[Tax]");
    await pressKey("Tab");
    await typeText("[User ID]");
    expect(getEditorValue()).toBe("coalesce([Tax], [User ID])");
  });

  it("should not show the default period in the name of a date column of a saved question (metabase#36631)", async () => {
    const card = createMockCard({
      id: 1,
      name: "Base question",
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: ORDERS_ID } }],
      }),
      // The API returns dataset columns here, with the `unit` that `Field` does not type.
      result_metadata: createOrdersTableDatasetColumns().map((column) =>
        column.name === "CREATED_AT"
          ? createOrdersCreatedAtDatasetColumn({ unit: "default" })
          : column,
      ) as unknown as Field[],
    });
    const provider = createMetadataProvider({
      metadata: createMockMetadata({
        databases: [createSampleDatabase()],
        questions: [card],
      }),
    });
    const query = Lib.createTestQuery(provider, {
      stages: [{ source: { type: "card", id: card.id } }],
    });
    await setup({ query });

    await typeText("[cre");
    const labels = await waitForCompletions();
    expect(labels).toContain("Created At");
    expect(labels.filter((label) => /default period/i.test(label))).toEqual([]);
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

  it("should apply a completion on a new line inside case (metabase#31964)", async () => {
    await setup({ query: createOrdersQuery() });

    await typeText("case()");
    await pressKey("ArrowLeft");
    await waitForHelpTextExample();
    await typeText('[Product -> Category] = "Widget", 1,');
    await pressKey("Enter");
    await typeText("[Product -> Categ");
    expect(await waitForCompletions()).toContain("Product → Category");
    await pressKey("Tab");

    expect(getEditorValue()).toBe(
      'case([Product → Category] = "Widget", 1,\n[Product → Category])',
    );
    await waitForHelpTextExample();
  });

  it("should complete non-aggregation functions in a custom aggregation (metabase#62987)", async () => {
    await setup({ query: createOrdersQuery(), expressionMode: "aggregation" });

    await typeText("Coun");
    await waitForCompletions();
    await clickCompletion("CountIf");

    await typeText("notEm");
    await waitForCompletions();
    await clickCompletion("notEmpty");

    expect(getEditorValue()).toBe("CountIf(notEmpty(column))");
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

  it("should not allow formatting or saving an invalid expression, and validate it when typing", async () => {
    const { onChangeClause, onClose } = await setup({
      query: createOrdersQuery(),
    });
    const doneButton = screen.getByRole("button", { name: "Done" });

    // non-existent column
    await typeText("abcdef");
    await typeName("A custom expression");
    expect(
      await screen.findByText(/^Unknown column: abcdef/i),
    ).toBeInTheDocument();
    expect(doneButton).toBeDisabled();

    // argument validation
    await replaceSource("SUBSTRING('foo', 0, 1)");
    await blurEditor();
    expect(
      await screen.findByText("Expected positive integer but found 0"),
    ).toBeInTheDocument();
    expect(doneButton).toBeDisabled();

    // incomplete expression
    await replaceSource("concat('foo', ");
    await blurEditor();
    expect(
      await screen.findByText("Expecting a closing parenthesis"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Auto-format" }),
    ).not.toBeInTheDocument();
    expect(doneButton).toBeDisabled();
    await userEvent.type(screen.getByTestId("expression-name"), "{enter}");
    expect(screen.getByTestId("expression-editor")).toBeInTheDocument();
    expect(onChangeClause).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // fix the expression
    await focusEditorAndWaitForHelpText();
    await pressKey("ArrowLeft");
    await typeText("'bar')");
    await blurEditor();
    await waitFor(() => expect(doneButton).toBeEnabled());
    expect(
      screen.getByRole("button", { name: "Auto-format" }),
    ).toBeInTheDocument();
    expect(getEditorValue()).toBe("concat('foo','bar') ");
  });
});

describe("ExpressionWidget > type validation", () => {
  it("should show a type error for year of a string but not for case with compatible branches (metabase#57674)", async () => {
    await setup({ query: createOrdersQuery() });

    await pasteText('year("a string")');
    await blurEditor();
    expect(
      await screen.findByText(/Types are incompatible/),
    ).toBeInTheDocument();

    await replaceSource('case([Total] > 100, "foo", "bar")');
    await blurEditor();
    await waitForValidationDebounce();
    expect(
      screen.queryByText(/Types are incompatible/),
    ).not.toBeInTheDocument();

    await typeName("Foo");
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("should accept an aggregation in a custom aggregation (metabase#58230)", async () => {
    const { onChangeClause } = await setup({
      query: createOrdersQuery(),
      expressionMode: "aggregation",
    });

    await pasteText("Average([Total])");
    await typeName("Foo");
    const doneButton = screen.getByRole("button", { name: "Done" });
    await waitFor(() => expect(doneButton).toBeEnabled());
    expect(
      screen.queryByText(/Aggregations like Average are not allowed/),
    ).not.toBeInTheDocument();

    await userEvent.click(doneButton);
    expect(onChangeClause).toHaveBeenCalledTimes(1);
    const [name, clause] = onChangeClause.mock.calls[0];
    expect(name).toBe("Foo");
    expect(Lib.expressionParts(createOrdersQuery(), -1, clause)).toMatchObject({
      operator: "avg",
    });
  });

  it("should validate a constant, an unsupported function and a bad date expression (metabase#41381, metabase#33439, metabase#33441)", async () => {
    await setup({
      query: createOrdersQuery(),
      database: createSampleDatabase({
        features: [...COMMON_DATABASE_FEATURES, "datetime-diff"],
      }),
    });
    const doneButton = screen.getByRole("button", { name: "Done" });

    await pasteText("'Test'");
    await blurEditor();
    await typeName("Constant");
    await waitFor(() => expect(doneButton).toBeEnabled());
    expect(screen.queryByText("Invalid expression")).not.toBeInTheDocument();

    await replaceSource(
      'convertTimezone("2022-12-28T12:00:00", "Canada/Pacific", "Canada/Eastern")',
    );
    await blurEditor();
    expect(
      await screen.findByText("Unsupported function convertTimezone"),
    ).toBeInTheDocument();
    expect(doneButton).toBeDisabled();

    await replaceSource('datetimeDiff([Created At] , now(), "days")');
    await blurEditor();
    expect(
      await screen.findByText("Types are incompatible."),
    ).toBeInTheDocument();
    expect(doneButton).toBeDisabled();
  });

  it("should reject convertTimezone with an invalid timezone (metabase#38498)", async () => {
    await setup({
      query: createOrdersQuery(),
      database: createSampleDatabase({
        features: [...COMMON_DATABASE_FEATURES, "convert-timezone"],
      }),
    });
    const doneButton = screen.getByRole("button", { name: "Done" });
    await typeName("Converted");

    await pasteText('convertTimezone([Created At], "Asia/Ho_Chi_Minh", "UTC")');
    await blurEditor();
    await waitFor(() => expect(doneButton).toBeEnabled());

    await replaceSource(
      'convertTimezone([Created At], "Asia/Ho_Chi_Mihn", "UTC")',
    );
    await blurEditor();
    expect(
      await screen.findByText("Types are incompatible."),
    ).toBeInTheDocument();
    expect(doneButton).toBeDisabled();
  });
});

describe("ExpressionWidget > formatting", () => {
  it("should keep the backslash of an escaped character when formatting (metabase#56596)", async () => {
    const source = String.raw`regexExtract([Vendor], "\s.*")`;
    const { onChangeClause } = await setup({
      database: createSampleDatabase({
        features: [...COMMON_DATABASE_FEATURES, "regex"],
      }),
    });

    // the extra spaces show that the formatter ran
    await pasteText(String.raw`regexExtract( [Vendor] ,  "\s.*" )`);
    await blurEditor();
    await userEvent.click(
      await screen.findByRole("button", { name: "Auto-format" }),
    );
    await waitFor(() => expect(getEditorValue()).toBe(source));
    await waitForValidationDebounce();

    await typeName("Last name");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChangeClause).toHaveBeenCalledTimes(1);
    const [name, clause] = onChangeClause.mock.calls[0];
    expect(name).toBe("Last name");
    const query = createProductsQuery();
    const parts = Lib.expressionParts(query, -1, clause);
    expect(parts).toMatchObject({
      operator: "regex-match-first",
      args: [expect.anything(), String.raw`\s.*`],
    });
  });
});

/**
 * Focuses the editor inside a function call and waits for the help text. Its
 * example is formatted asynchronously, so the focus happens inside `waitFor`,
 * where that update cannot escape `act`.
 */
async function focusEditorAndWaitForHelpText() {
  await waitFor(() => {
    const view = getEditorView();
    if (!view.hasFocus) {
      view.focus();
    }
    expect(screen.getByTestId("helptext-example")).toHaveTextContent(/\S/);
  });
}

async function replaceSource(source: string) {
  await focusEditor();
  await selectRange(0, getEditorValue().length);
  await pasteText(source);
}

async function typeName(name: string) {
  await userEvent.type(screen.getByTestId("expression-name"), name);
}
