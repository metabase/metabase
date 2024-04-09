import userEvent from "@testing-library/user-event";

import { getIcon, renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import type { Expression } from "metabase-types/api";

import type { ExpressionWidgetProps } from "./ExpressionWidget";
import { ExpressionWidget } from "./ExpressionWidget";
import { ExpressionWidgetHeader } from "./ExpressionWidgetHeader";

describe("ExpressionWidget", () => {
  it("should render proper controls", () => {
    setup();

    expect(screen.getByText("Expression")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("should not render Name field", () => {
    setup();

    expect(screen.queryByText("Name")).not.toBeInTheDocument();
  });

  it("should render help icon with tooltip which opens documentation page", async () => {
    setup();

    const icon = getIcon("info");
    expect(icon).toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: "Open expressions documentation",
    });
    expect(link).toBeInTheDocument();

    expect(link).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/questions/query-builder/expressions.html",
    );

    await userEvent.hover(link);

    expect(
      screen.getByText(
        "You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.",
      ),
    ).toBeInTheDocument();
  });

  it("should trigger onChangeExpression if expression is valid", async () => {
    const { onChangeExpression } = setup();

    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton).toBeDisabled();

    const expressionInput = screen.getByRole("textbox");
    expect(expressionInput).toHaveClass("ace_text-input");

    await userEvent.type(expressionInput, "1 + 1");
    await userEvent.tab();

    expect(doneButton).toBeEnabled();

    await userEvent.click(doneButton);

    expect(onChangeExpression).toHaveBeenCalledTimes(1);
    expect(onChangeExpression).toHaveBeenCalledWith("", ["+", 1, 1]);
  });

  it("should trigger onChangeClause if expression is valid", async () => {
    const { getRecentExpressionClauseInfo, onChangeClause } = setup();

    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton).toBeDisabled();

    const expressionInput = screen.getByRole("textbox");
    expect(expressionInput).toHaveClass("ace_text-input");

    await userEvent.type(expressionInput, "1 + 1");
    await userEvent.tab();

    expect(doneButton).toBeEnabled();

    await userEvent.click(doneButton);

    expect(onChangeClause).toHaveBeenCalledTimes(1);
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

  describe("withName=true", () => {
    it("should render Name field", () => {
      setup({ withName: true });

      expect(screen.getByText("Name")).toBeInTheDocument();
    });

    it("should validate name value", async () => {
      const expression: Expression = ["+", 1, 1];
      const {
        getRecentExpressionClauseInfo,
        onChangeExpression,
        onChangeClause,
      } = setup({
        expression,
        withName: true,
      });

      const doneButton = screen.getByRole("button", { name: "Done" });
      const expressionNameInput = screen.getByPlaceholderText(
        "Something nice and descriptive",
      );

      expect(doneButton).toBeDisabled();

      await userEvent.type(screen.getByDisplayValue("1 + 1"), "{enter}");

      // enter in expression editor should not trigger "onChangeClause" or "onChangeExpression"
      // as popover is not valid with empty "name"
      expect(onChangeClause).toHaveBeenCalledTimes(0);
      expect(onChangeExpression).toHaveBeenCalledTimes(0);

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

      expect(onChangeExpression).toHaveBeenCalledTimes(1);
      expect(onChangeExpression).toHaveBeenCalledWith(
        "Some n_am!e 2q$w&YzT(6i~#sLXv7+HjP}Ku1|9c*RlF@4o5N=e8;G*-bZ3/U0:Qa'V,t(W-_D",
        expression,
      );
      expect(onChangeClause).toHaveBeenCalledTimes(1);
      expect(onChangeClause).toHaveBeenCalledWith(
        "Some n_am!e 2q$w&YzT(6i~#sLXv7+HjP}Ku1|9c*RlF@4o5N=e8;G*-bZ3/U0:Qa'V,t(W-_D",
        expect.anything(),
      );
      expect(getRecentExpressionClauseInfo().displayName).toBe("1 + 1");
    });
  });
});

function setup(additionalProps?: Partial<ExpressionWidgetProps>) {
  const query = createQuery();
  const stageIndex = 0;
  const onChangeExpression = jest.fn();
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
      expression={undefined}
      clause={undefined}
      name={undefined}
      query={query}
      reportTimezone="UTC"
      stageIndex={stageIndex}
      onChangeExpression={onChangeExpression}
      onChangeClause={onChangeClause}
      onClose={onClose}
      {...additionalProps}
    />,
  );

  return {
    getRecentExpressionClauseInfo,
    onChangeExpression,
    onChangeClause,
    onClose,
  };
}
