jest.unmock("@uiw/react-codemirror");

import { screen, waitFor, within } from "__support__/ui";

import {
  pressKey,
  queryHelpText,
  setup,
  typeText,
  waitForValidationDebounce,
} from "./setup";

describe("ExpressionWidget > help text", () => {
  it("should show the help text of the function being typed", async () => {
    await setup();

    await typeText("lower()");
    await pressKey("ArrowLeft");

    expect(
      await screen.findByTestId("expression-helper-popover-structure"),
    ).toHaveTextContent("lower(value)");
    const helpText = screen.getByTestId("expression-helper");
    expect(
      within(helpText).getByText(
        "Returns the string of text in all lower case.",
      ),
    ).toBeInTheDocument();
    expect(
      within(helpText).getByText(
        "The column with values to convert to lower case.",
      ),
    ).toBeInTheDocument();
    // the example is highlighted asynchronously
    await waitFor(() =>
      expect(screen.getByTestId("helptext-example")).not.toBeEmptyDOMElement(),
    );
    await waitForValidationDebounce();
  });

  it("should not show the help text of a function the expression mode does not support", async () => {
    await setup({ expressionMode: "expression" });

    await typeText("Average([Price])");
    await pressKey("ArrowLeft", { times: 2 });
    await waitForValidationDebounce();

    expect(queryHelpText()).not.toBeInTheDocument();
  });

  it("should show the help text of the same function where the expression mode supports it", async () => {
    await setup({ expressionMode: "aggregation" });

    await typeText("Average([Price])");
    await pressKey("ArrowLeft", { times: 2 });

    expect(
      await screen.findByTestId("expression-helper-popover-structure"),
    ).toHaveTextContent("Average(column)");
  });
});
