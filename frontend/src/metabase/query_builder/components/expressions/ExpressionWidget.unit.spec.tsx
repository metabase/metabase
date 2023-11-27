import userEvent from "@testing-library/user-event";
import { checkNotNull } from "metabase/lib/types";
import { getIcon, render, screen } from "__support__/ui";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import type { Expression } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { ExpressionWidgetHeader } from "./ExpressionWidgetHeader";
import type { ExpressionWidgetProps } from "./ExpressionWidget";
import { ExpressionWidget } from "./ExpressionWidget";

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

  it("should render help icon with tooltip which opens documentation page", () => {
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

    userEvent.hover(link);

    expect(
      screen.getByText(
        "You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.",
      ),
    ).toBeInTheDocument();
  });

  it("should trigger onChangeExpression if expression is valid", () => {
    const { onChangeExpression } = setup();

    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton).toBeDisabled();

    const expressionInput = screen.getByRole("textbox");
    expect(expressionInput).toHaveClass("ace_text-input");

    userEvent.type(expressionInput, "1 + 1");
    userEvent.tab();

    expect(doneButton).toBeEnabled();

    userEvent.click(doneButton);

    expect(onChangeExpression).toHaveBeenCalledTimes(1);
    expect(onChangeExpression).toHaveBeenCalledWith("", ["+", 1, 1]);
  });

  it(`should render interactive header if it is passed`, () => {
    const mockTitle = "Some Title";
    const onClose = jest.fn();
    setup({
      header: <ExpressionWidgetHeader title={mockTitle} onBack={onClose} />,
      onClose,
    });

    const titleEl = screen.getByText(mockTitle);
    expect(titleEl).toBeInTheDocument();

    userEvent.click(titleEl);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("withName=true", () => {
    it("should render Name field", () => {
      setup({ withName: true });

      expect(screen.getByText("Name")).toBeInTheDocument();
    });

    it("should validate name value", () => {
      const expression: Expression = ["+", 1, 1];
      const { onChangeExpression } = setup({ expression, withName: true });

      const doneButton = screen.getByRole("button", { name: "Done" });
      const expressionNameInput = screen.getByPlaceholderText(
        "Something nice and descriptive",
      );

      expect(doneButton).toBeDisabled();

      userEvent.type(screen.getByDisplayValue("1 + 1"), "{enter}");

      // enter in expression editor should not trigger "onChangeExpression" as popover is not valid with empty "name"
      expect(onChangeExpression).toHaveBeenCalledTimes(0);

      // The name must not be empty
      userEvent.type(expressionNameInput, "");
      expect(doneButton).toBeDisabled();

      // The name must not consist of spaces or tabs only.
      userEvent.type(expressionNameInput, " ");
      expect(doneButton).toBeDisabled();
      userEvent.type(expressionNameInput, "\t");
      expect(doneButton).toBeDisabled();
      userEvent.type(expressionNameInput, "  \t\t");
      expect(doneButton).toBeDisabled();

      userEvent.clear(expressionNameInput);

      userEvent.type(
        expressionNameInput,
        "Some n_am!e 2q$w&YzT(6i~#sLXv7+HjP}Ku1|9c*RlF@4o5N=e8;G*-bZ3/U0:Qa'V,t(W-_D",
      );

      expect(doneButton).toBeEnabled();

      userEvent.click(doneButton);

      expect(onChangeExpression).toHaveBeenCalledTimes(1);
      expect(onChangeExpression).toHaveBeenCalledWith(
        "Some n_am!e 2q$w&YzT(6i~#sLXv7+HjP}Ku1|9c*RlF@4o5N=e8;G*-bZ3/U0:Qa'V,t(W-_D",
        expression,
      );
    });
  });
});

const createMockQueryForExpressions = () => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });

  const metadata = getMetadata(state);
  const query = checkNotNull(metadata.table(ORDERS_ID)).query();

  return query;
};

function setup(additionalProps?: Partial<ExpressionWidgetProps>) {
  const mocks = {
    onClose: jest.fn(),
    onChangeExpression: jest.fn(),
  };

  const props = {
    expression: undefined,
    name: undefined,
    legacyQuery: createMockQueryForExpressions(),
    reportTimezone: "UTC",
    ...mocks,
    ...additionalProps,
  };

  render(<ExpressionWidget {...props} />);

  return mocks;
}
