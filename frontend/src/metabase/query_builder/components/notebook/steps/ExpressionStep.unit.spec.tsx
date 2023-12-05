import userEvent from "@testing-library/user-event";
import { checkNotNull } from "metabase/lib/types";
import { render, screen, within } from "__support__/ui";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";

import type { Expression } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

import type { NotebookStepUiComponentProps } from "../types";
import { createMockNotebookStep } from "../test-utils";
import ExpressionStep from "./ExpressionStep";

describe("Notebook Editor > Expression Step", () => {
  it("should handle updating existing expression", async () => {
    const expression: Expression = ["abs", ["field", 17, null]];
    const {
      mocks: { addExpression, updateExpression, updateQuery },
    } = setup(undefined, {
      // add an existing custom column expression
      "old name": expression,
    });

    userEvent.click(screen.getByText("old name"));

    const nameField = await screen.findByPlaceholderText(
      "Something nice and descriptive",
    );

    userEvent.clear(nameField);
    userEvent.type(nameField, "new name{enter}");

    expect(updateExpression).toHaveBeenCalledTimes(1);
    expect(updateExpression).toHaveBeenCalledWith(
      "new name",
      expression,
      "old name",
    );
    expect(addExpression).toHaveBeenCalledTimes(0);
    expect(updateQuery).toHaveBeenCalledTimes(1);
  });

  it("should handle removing existing expression", () => {
    const expression: Expression = ["abs", ["field", 17, null]];
    const {
      mocks: { removeExpression },
    } = setup(undefined, {
      // add an existing custom column expression
      "expr name": expression,
    });

    const expressionItem = screen.getByText("expr name");
    const closeIcon = within(expressionItem).getByRole("img", {
      name: `close icon`,
    });

    userEvent.click(closeIcon);

    expect(removeExpression).toHaveBeenCalledTimes(1);
    expect(removeExpression).toHaveBeenCalledWith("expr name");
  });
});

const createMockQueryForExpressions = (
  expressions?: Record<string, Expression>,
) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });

  const metadata = getMetadata(state);
  let query = checkNotNull(metadata.table(ORDERS_ID)).query();

  if (expressions) {
    Object.entries(expressions).forEach(([name, expression]) => {
      query = query.addExpression(name, expression);
    });
  }

  return query;
};

function setup(
  additionalProps?: Partial<NotebookStepUiComponentProps>,
  expressions?: Record<string, Expression>,
) {
  const updateQuery = jest.fn();
  const addExpression = jest.fn();
  const updateExpression = jest.fn();
  const removeExpression = jest.fn();

  const query = createMockQueryForExpressions(expressions);

  query.addExpression = addExpression;
  query.updateExpression = updateExpression;
  query.removeExpression = removeExpression;

  const step = createMockNotebookStep({
    type: "expression",
    query,
  });

  render(
    <ExpressionStep
      step={step}
      color="#93A1AB"
      query={query}
      topLevelQuery={step.topLevelQuery}
      updateQuery={updateQuery}
      isLastOpened={false}
      reportTimezone="UTC"
      {...additionalProps}
    />,
  );

  return {
    mocks: { addExpression, updateExpression, removeExpression, updateQuery },
  };
}
