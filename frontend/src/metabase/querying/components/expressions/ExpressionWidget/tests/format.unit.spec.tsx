jest.unmock("@uiw/react-codemirror");

import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dedent } from "ts-dedent";

import { screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  blurEditor,
  focusEditor,
  getEditorValue,
  pasteText,
  pressKey,
  selectRange,
  setup,
  typeText,
} from "./setup";

function createOrdersQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  });
}

function queryFormatButton() {
  return screen.queryByRole("button", { name: "Auto-format" });
}

async function clickFormatButton() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Auto-format" }),
  );
}

async function replaceSource(source: string) {
  await focusEditor();
  await selectRange(0, getEditorValue().length);
  await typeText(source);
}

async function pressFormatShortcut() {
  await pressKey("f", { shiftKey: true, modKey: true });
}

describe("ExpressionWidget > format", () => {
  it("should format the expression only when clicking the format button", async () => {
    await setup({ query: createOrdersQuery() });

    expect(screen.getByTestId("expression-editor")).toBeInTheDocument();
    expect(queryFormatButton()).not.toBeInTheDocument();

    await typeText("1+1");
    await blurEditor();
    expect(
      await screen.findByRole("button", { name: "Auto-format" }),
    ).toBeEnabled();
    expect(getEditorValue()).toBe("1+1");

    // moving focus out of the editor and back does not format it
    await act(async () => screen.getByTestId("expression-name").focus());
    await focusEditor();
    expect(getEditorValue()).toBe("1+1");
    await typeText("2");
    expect(getEditorValue()).toBe("1+12");

    await replaceSource("1+1");
    await blurEditor();
    await clickFormatButton();
    await waitFor(() => expect(getEditorValue()).toBe("1 + 1"));

    // the cursor is at the end of the formatted expression
    await focusEditor();
    await typeText("2");
    expect(getEditorValue()).toBe("1 + 12");
  });

  it("should format the expression with the keyboard shortcut", async () => {
    await setup({ query: createOrdersQuery() });

    await typeText("1+1");
    await blurEditor();
    await focusEditor();
    expect(
      await screen.findByRole("button", { name: "Auto-format" }),
    ).toBeEnabled();

    await pressFormatShortcut();
    await waitFor(() => expect(getEditorValue()).toBe("1 + 1"));

    // the cursor is at the end of the formatted expression
    await typeText("2");
    expect(getEditorValue()).toBe("1 + 12");
  });

  it("should not format an invalid expression with the keyboard shortcut", async () => {
    await setup({ query: createOrdersQuery() });

    await typeText("1+");
    await blurEditor();
    await focusEditor();
    expect(await screen.findByText("Expected expression")).toBeInTheDocument();

    await pressFormatShortcut();
    expect(getEditorValue()).toBe("1+");

    await typeText("2");
    expect(getEditorValue()).toBe("1+2");
  });

  it("should format long expressions on multiple lines", async () => {
    await setup({ query: createOrdersQuery() });

    await pasteText(
      "concat(coalesce([Product → Created At], [Created At]), 'foo', 'bar')",
    );
    await blurEditor();
    await clickFormatButton();

    await waitFor(() =>
      expect(getEditorValue()).toBe(
        dedent`
          concat(
            coalesce([Product → Created At], [Created At]),
            "foo",
            "bar"
          )
        `.trim(),
      ),
    );
  });

  it("should keep the parentheses that change the result of an aggregation when formatting (metabase#12899, metabase#13306)", async () => {
    const query = createOrdersQuery();
    const { onChangeClause } = await setup({
      query,
      expressionMode: "aggregation",
    });

    await pasteText(
      "sum([Total]) / (sum([Product → Price]) * average([Quantity]))",
    );
    await blurEditor();
    await clickFormatButton();
    await waitFor(() =>
      expect(getEditorValue()).toBe(
        dedent`
          Sum([Total]) /
            (Sum([Product → Price]) * Average([Quantity]))
        `.trim(),
      ),
    );

    await replaceSource("2 * Max([Total])");
    await blurEditor();
    await userEvent.type(
      screen.getByTestId("expression-name"),
      "twice max total",
    );
    const doneButton = screen.getByRole("button", { name: "Done" });
    await waitFor(() => expect(doneButton).toBeEnabled());
    await userEvent.click(doneButton);

    expect(onChangeClause).toHaveBeenCalledTimes(1);
    const [name, clause] = onChangeClause.mock.calls[0];
    expect(name).toBe("twice max total");
    expect(Lib.displayInfo(query, -1, clause).displayName).toBe(
      "2 × Max of Total",
    );
  });

  it("should show an aggregation of a custom column with brackets in its name with the brackets escaped (metabase#15316)", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          expressions: [
            {
              name: "Other [2026]",
              value: { type: "literal", value: 1 },
            },
            {
              name: "MyCC [2027]",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "literal", value: 1 },
                  { type: "literal", value: 1 },
                ],
              },
            },
          ],
          aggregations: [
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "MyCC [2027]" }],
            },
          ],
        },
      ],
    });
    const [clause] = Lib.aggregations(query, -1);
    expect(Lib.displayInfo(query, -1, clause).displayName).toBe(
      "Sum of MyCC [2027]",
    );

    await setup({ query, expressionMode: "aggregation", clause });

    await waitFor(() =>
      expect(getEditorValue()).toBe("Sum([MyCC \\[2027\\]])"),
    );
  });
});
