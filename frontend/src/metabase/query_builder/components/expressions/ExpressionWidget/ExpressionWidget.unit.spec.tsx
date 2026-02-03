import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";

import type { ExpressionWidgetProps } from "./ExpressionWidget";
import { ExpressionWidget } from "./ExpressionWidget";
import { ExpressionWidgetHeader } from "./ExpressionWidgetHeader";

describe("ExpressionWidget", () => {
  it("should render proper controls", () => {
    setup();
    expect(
      screen.getByTestId("custom-expression-query-editor"),
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("should not render Name field", () => {
    setup();

    expect(screen.queryByText("Name")).not.toBeInTheDocument();
  });

  it("should trigger onChangeClause if expression is valid", async () => {
    const { getRecentExpressionClauseInfo, onChangeClause } = await setup();

    const doneButton = screen.getByRole("button", { name: /(Done|Update)/ });
    expect(doneButton).toBeDisabled();

    const expressionInput = screen.getByRole("textbox");

    await userEvent.type(expressionInput, "1 + 1");
    await userEvent.tab();

    await waitFor(() => expect(doneButton).toBeEnabled());

    await userEvent.click(doneButton);

    await waitFor(() => expect(onChangeClause).toHaveBeenCalledTimes(1));
    expect(onChangeClause).toHaveBeenCalledWith("", expect.anything());
    expect(getRecentExpressionClauseInfo().displayName).toBe("1 + 1");
  });

  it(`should render interactive header if it is passed`, async () => {
    const mockTitle = "Some Title";
    const onClose = jest.fn();
    setup({
      header: <ExpressionWidgetHeader title={mockTitle} onBack={onClose} />,
      onClose,
    });

    const titleEl = screen.getByText(mockTitle);
    expect(titleEl).toBeInTheDocument();

    await userEvent.click(titleEl);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("withName = true", () => {
    it("should render Name field", () => {
      setup({ withName: true });

      expect(screen.getByTestId("expression-name")).toBeInTheDocument();
    });

    it("should validate name value", async () => {
      const clause = Lib.expressionClause("+", [1, 1]);
      const { getRecentExpressionClauseInfo, onChangeClause } = await setup({
        withName: true,
        clause,
      });

      const doneButton = screen.getByRole("button", { name: /(Done|Update)/ });
      const expressionNameInput = screen.getByTestId("expression-name");

      expect(doneButton).toBeDisabled();

      const input = await screen.findByDisplayValue("1 + 1");
      await userEvent.type(input, "{enter}");

      // enter in expression editor should not trigger "onChangeClause"
      // as popover is not valid with empty "name"
      expect(onChangeClause).toHaveBeenCalledTimes(0);

      // The name must not be empty
      await userEvent.clear(expressionNameInput);
      expect(doneButton).toBeDisabled();

      // The name must not consist of spaces or tabs only.
      await userEvent.type(expressionNameInput, " ");
      expect(doneButton).toBeDisabled();
      await userEvent.type(expressionNameInput, "\t");
      expect(doneButton).toBeDisabled();
      await userEvent.type(expressionNameInput, "  \t\t");
      expect(doneButton).toBeDisabled();

      await userEvent.clear(expressionNameInput);

      await userEvent.type(
        expressionNameInput,
        "Some n_am!e 2q$w&YzT(6i~#sLXv7+HjP}Ku1|9c*RlF@4o5N=e8;G*-bZ3/U0:Qa'V,t(W-_D",
      );

      expect(doneButton).toBeEnabled();

      await userEvent.click(doneButton);

      expect(onChangeClause).toHaveBeenCalledTimes(1);
      expect(onChangeClause).toHaveBeenCalledWith(
        "Some n_am!e 2q$w&YzT(6i~#sLXv7+HjP}Ku1|9c*RlF@4o5N=e8;G*-bZ3/U0:Qa'V,t(W-_D",
        expect.anything(),
      );
      expect(getRecentExpressionClauseInfo().displayName).toBe("1 + 1");
    });
  });

  describe("expressionMode = 'aggregation'", () => {
    it("should show 'unknown metric' error if the identifier is not recognized as a dimension (metabase#50753)", async () => {
      await setup({ expressionMode: "aggregation" });

      await userEvent.paste("[Imaginary]");
      await userEvent.tab();

      const doneButton = screen.getByRole("button", { name: "Done" });
      expect(doneButton).toBeDisabled();

      await screen.findByText(
        "Unknown Aggregation, Measure or Metric: Imaginary",
      );
    });

    it("should show 'no aggregation found' error if the identifier is recognized as a dimension (metabase#50753)", async () => {
      await setup({ expressionMode: "aggregation" });

      await userEvent.paste("[Total] / [Subtotal]");
      await userEvent.tab();

      const doneButton = screen.getByRole("button", { name: "Done" });
      expect(doneButton).toBeDisabled();

      await screen.findByText(
        "No aggregation found in: Total. Use functions like Sum() or custom Metrics",
      );
    });
  });

  describe("expressionMode = 'expression'", () => {
    it("should show a detailed error when comma is missing (metabase#15892)", async () => {
      await setup({ expressionMode: "expression" });

      await userEvent.paste('concat([Tax] "test")');
      await userEvent.tab();

      const doneButton = screen.getByRole("button", { name: "Done" });
      expect(doneButton).toBeDisabled();

      await screen.findByText('Expecting operator but got "test" instead');
    });
  });
});

async function setup(additionalProps?: Partial<ExpressionWidgetProps>) {
  const query = createQuery();
  const stageIndex = 0;
  const availableColumns = Lib.expressionableColumns(query, stageIndex);
  const onChangeClause = jest.fn();
  const onClose = jest.fn();

  function getRecentExpressionClause(): Lib.Clause {
    expect(onChangeClause).toHaveBeenCalled();
    const [_name, clause] = onChangeClause.mock.lastCall;
    return clause;
  }

  function getRecentExpressionClauseInfo() {
    return Lib.displayInfo(query, stageIndex, getRecentExpressionClause());
  }

  renderWithProviders(
    <ExpressionWidget
      clause={undefined}
      name={undefined}
      query={query}
      stageIndex={stageIndex}
      availableColumns={availableColumns}
      reportTimezone="UTC"
      onChangeClause={onChangeClause}
      onClose={onClose}
      {...additionalProps}
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId("custom-expression-query-editor")).toHaveProperty(
      "readOnly",
      false,
    ),
  );
  screen.getByTestId("custom-expression-query-editor").focus();

  return {
    getRecentExpressionClauseInfo,
    onChangeClause,
    onClose,
  };
}
