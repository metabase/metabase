jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";

import { act, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  blurEditor,
  getEditorValue,
  getEditorView,
  pressKey,
  selectRange,
  setCursorPosition,
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

function findFormatButton() {
  return screen.findByRole("button", { name: "Auto-format" });
}

function getDoneButton() {
  return screen.getByRole("button", { name: "Done" });
}

/** Replaces the whole source with typed text, as clearing and typing does. */
async function replaceText(text: string) {
  await focusEditor();
  await selectRange(0, getEditorValue().length);
  await typeText(text);
}

/** Types at the end of the source, where clicking the editor's right edge puts the caret. */
async function typeAtEnd(text: string) {
  await focusEditor();
  await setCursorPosition(getEditorValue().length);
  await typeText(text);
}

async function focusEditor() {
  await act(async () => getEditorView().focus());
}

async function pressFormatShortcut() {
  // CodeMirror resolves a shifted letter key by its key code
  await pressKey("F", { shiftKey: true, ctrlKey: true, keyCode: 70 });
}

async function typeName(name: string) {
  await userEvent.type(screen.getByTestId("expression-name"), name);
}

describe("ExpressionWidget > format", () => {
  it("should format the expression only when clicking the format button", async () => {
    await setup({ query: createOrdersQuery() });

    // the format button is hidden while the editor is empty
    expect(screen.getByTestId("expression-editor")).toBeInTheDocument();
    expect(queryFormatButton()).not.toBeInTheDocument();

    await typeText("1+1");
    await blurEditor();

    // leaving the editor does not format the expression
    expect(getEditorValue()).toBe("1+1");
    expect(await findFormatButton()).toBeInTheDocument();
    expect(getEditorValue()).toBe("1+1");

    // focus moving through the editor (Tab, Shift+Tab) does not format it
    await focusEditor();
    await blurEditor();
    expect(getEditorValue()).toBe("1+1");
    await typeAtEnd("2");
    expect(getEditorValue()).toBe("1+12");

    await replaceText("1+1");
    await blurEditor();
    await userEvent.click(await findFormatButton());
    await waitFor(() => expect(getEditorValue()).toBe("1 + 1"));

    await typeAtEnd("2");
    expect(getEditorValue()).toBe("1 + 12");
  });

  it("should format the expression when pressing the format keyboard shortcut", async () => {
    await setup({ query: createOrdersQuery() });

    await typeText("1+1");
    await blurEditor();
    await focusEditor();
    expect(await findFormatButton()).toBeInTheDocument();

    await pressFormatShortcut();
    await waitFor(() => expect(getEditorValue()).toBe("1 + 1"));

    await typeAtEnd("2");
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

    await typeAtEnd("2");
    expect(getEditorValue()).toBe("1+2");
  });

  it("should format long expressions on multiple lines", async () => {
    await setup({ query: createOrdersQuery() });

    await typeText(
      "concat(coalesce([Product → Created At], [Created At]), 'foo', 'bar')",
    );
    expect(getEditorValue()).toBe(
      "concat(coalesce([Product → Created At], [Created At]), 'foo', 'bar')",
    );
    await blurEditor();
    await userEvent.click(await findFormatButton());

    await waitFor(() =>
      expect(getEditorValue()).toBe(
        [
          "concat(",
          "  coalesce([Product → Created At], [Created At]),",
          '  "foo",',
          '  "bar"',
          ")",
        ].join("\n"),
      ),
    );
  });

  it("should keep parentheses that change the result when formatting an aggregation (metabase#12899, metabase#13306)", async () => {
    const query = createOrdersQuery();
    const { onChangeClause } = await setup({
      query,
      expressionMode: "aggregation",
    });

    await typeText(
      "sum([Total]) / (sum([Product → Price]) * average([Quantity]))",
    );
    await blurEditor();
    await userEvent.click(await findFormatButton());

    await waitFor(() =>
      expect(getEditorValue()).toBe(
        [
          "Sum([Total]) /",
          "  (Sum([Product → Price]) * Average([Quantity]))",
        ].join("\n"),
      ),
    );

    await replaceText("2 * Max([Total])");
    await blurEditor();
    await typeName("twice max total");
    await waitFor(() => expect(getDoneButton()).toBeEnabled());
    await userEvent.click(getDoneButton());

    expect(onChangeClause).toHaveBeenCalledTimes(1);
    const [name, clause] = onChangeClause.mock.calls[0];
    expect(name).toBe("twice max total");
    expect(Lib.expressionParts(query, -1, clause)).toMatchObject({
      operator: "*",
      args: [2, { operator: "max" }],
    });
  });

  it("should not allow formatting or saving an invalid expression, and validate it when typing", async () => {
    const { onChangeClause, onClose } = await setup({
      query: createOrdersQuery(),
    });
    await typeName("A custom expression");

    // non-existent field reference
    await focusEditor();
    await typeText("abcdef");
    await blurEditor();
    expect(
      await screen.findByText(/^Unknown column: abcdef/i),
    ).toBeInTheDocument();
    expect(getDoneButton()).toBeDisabled();

    // argument validation
    await replaceText("SUBSTRING('foo', 0, 1)");
    await blurEditor();
    expect(
      await screen.findByText(/Expected positive integer but found 0/),
    ).toBeInTheDocument();
    expect(getDoneButton()).toBeDisabled();

    // incomplete expression
    await replaceText("concat('foo', ");
    await blurEditor();
    expect(getEditorValue()).toBe("concat('foo', )");
    await waitFor(() => expect(getDoneButton()).toBeDisabled());
    expect(queryFormatButton()).not.toBeInTheDocument();

    await userEvent.type(screen.getByTestId("expression-name"), "{enter}");
    expect(screen.getByTestId("expression-editor")).toBeInTheDocument();
    expect(onChangeClause).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // fix the expression
    await focusEditor();
    await setCursorPosition(getEditorValue().length);
    await pressKey("ArrowLeft");
    await typeText("'bar')");
    await waitFor(() => expect(getDoneButton()).toBeEnabled());
    expect(await findFormatButton()).toBeInTheDocument();
  });
});
