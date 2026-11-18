jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";
import { COMMON_DATABASE_FEATURES } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import {
  getEditorValue,
  getEditorView,
  pressKey,
  selectRange,
  setup,
  typeText,
  waitForValidationDebounce,
} from "./setup";

/**
 * `FunctionBrowser` renders each group of functions in a fragment without a
 * key, and the test setup fails a test on that warning. Drop only that warning
 * until the component is fixed.
 */
function ignoreFunctionBrowserKeyWarning() {
  const originalError = console.error;
  jest.spyOn(console, "error").mockImplementation((...args) => {
    const [template, ...rest] = args;
    const isFunctionBrowserKeyWarning =
      typeof template === "string" &&
      template.includes('unique "key" prop') &&
      rest.some(
        (arg) => typeof arg === "string" && arg.includes("FunctionBrowser"),
      );
    if (!isFunctionBrowserKeyWarning) {
      originalError(...args);
    }
  });
}

async function openFunctionBrowser() {
  await userEvent.click(
    screen.getByRole("button", { name: "Function browser" }),
  );
  return screen.findByTestId("expression-editor-function-browser");
}

async function clickFunction(name: string) {
  const functionBrowser = screen.getByTestId(
    "expression-editor-function-browser",
  );
  await userEvent.click(await within(functionBrowser).findByText(name));
}

/** Keystrokes after an insertion must reach the editor, not the browser. */
function expectEditorToHaveFocus() {
  expect(getEditorView().contentDOM).toHaveFocus();
}

async function clearEditor() {
  await selectRange(0, getEditorValue().length);
  await pressKey("Backspace");
}

describe("ExpressionWidget > function browser", () => {
  beforeEach(() => {
    ignoreFunctionBrowserKeyWarning();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should be possible to insert functions by clicking them in the function browser", async () => {
    await setup();
    const functionBrowser = await openFunctionBrowser();

    await clickFunction("datetimeAdd");
    await waitFor(() => expect(getEditorValue()).toBe("datetimeAdd()"));
    expectEditorToHaveFocus();

    await clickFunction("day");
    await waitFor(() => expect(getEditorValue()).toBe("datetimeAdd(day())"));
    expectEditorToHaveFocus();

    await typeText('"foo"');
    await pressKey("ArrowRight");
    await typeText(", ");
    expect(getEditorValue()).toBe('datetimeAdd(day("foo"), )');

    await clickFunction("day");
    await waitFor(() =>
      expect(getEditorValue()).toBe('datetimeAdd(day("foo"), day())'),
    );

    // parens are inserted even when the clause has no arguments
    await clearEditor();
    expect(getEditorValue()).toBe("");
    await userEvent.type(
      within(functionBrowser).getByPlaceholderText("Search functions…"),
      "now",
    );
    expect(
      within(functionBrowser).getByPlaceholderText("Search functions…"),
    ).toHaveFocus();
    await clickFunction("now");
    await waitFor(() => expect(getEditorValue()).toBe("now()"));
    // the editor takes the focus back from the search input
    expectEditorToHaveFocus();
    await waitForValidationDebounce();
  });

  it("should be possible to replace text when inserting functions", async () => {
    await setup();

    await typeText("foo bar baz");
    // select "bar"
    await selectRange("foo bar".length, "foo ".length);
    await openFunctionBrowser();
    await clickFunction("day");
    await waitFor(() => expect(getEditorValue()).toBe("foo day() baz"));
    expectEditorToHaveFocus();
    await waitForValidationDebounce();
  });

  it("should be possible to filter functions in the function browser", async () => {
    await setup();
    const functionBrowser = await openFunctionBrowser();
    const searchInput =
      within(functionBrowser).getByPlaceholderText("Search functions…");

    await userEvent.type(searchInput, "con");
    expect(
      within(functionBrowser).queryByText("datetimeAdd"),
    ).not.toBeInTheDocument();
    expect(within(functionBrowser).getByText("concat")).toBeInTheDocument();
    expect(within(functionBrowser).getByText("second")).toBeInTheDocument();

    await userEvent.clear(searchInput);
    expect(
      within(functionBrowser).getByText("datetimeAdd"),
    ).toBeInTheDocument();

    // a message shows when no functions match the filter
    await userEvent.type(searchInput, "foobar");
    expect(
      within(functionBrowser).getByText("Didn't find any results"),
    ).toBeInTheDocument();
  });

  async function searchConvertTimezone() {
    const functionBrowser = await openFunctionBrowser();
    const searchInput =
      within(functionBrowser).getByPlaceholderText("Search functions…");
    await userEvent.type(searchInput, "convertTimezone");
    expect(searchInput).toHaveValue("convertTimezone");
    return functionBrowser;
  }

  it("should hide functions the database does not support", async () => {
    await setup({
      database: createSampleDatabase({ features: COMMON_DATABASE_FEATURES }),
    });
    const functionBrowser = await searchConvertTimezone();

    expect(
      await within(functionBrowser).findByText("Didn't find any results"),
    ).toBeInTheDocument();
    expect(
      within(functionBrowser).queryByText("convertTimezone"),
    ).not.toBeInTheDocument();
  });

  it("should show functions the database supports", async () => {
    await setup({
      database: createSampleDatabase({
        features: [...COMMON_DATABASE_FEATURES, "convert-timezone"],
      }),
    });
    const functionBrowser = await searchConvertTimezone();

    expect(
      await within(functionBrowser).findByText("convertTimezone"),
    ).toBeInTheDocument();
    expect(
      within(functionBrowser).queryByText("Didn't find any results"),
    ).not.toBeInTheDocument();
  });
});
