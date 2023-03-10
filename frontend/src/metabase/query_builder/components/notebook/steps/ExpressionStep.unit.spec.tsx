import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen } from "__support__/ui";
import { createEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import { createMockState } from "metabase-types/store/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { Expression } from "metabase-types/types/Query";
import ExpressionStep, { ExpressionStepProps } from "./ExpressionStep";

describe("Notebook Editor > Expression Step", () => {
  it("should handle updating existing expression", async () => {
    const expression: Expression = ["abs", ["field", 17, null]];
    const {
      props: { updateQuery },
      mocks: { addExpression, updateExpression },
    } = setup(undefined, {
      // add an existing custom column expression
      "old name": expression,
    });

    userEvent.click(screen.getByText("old name"));

    const nameField = await screen.findByPlaceholderText(
      "Something nice and descriptive",
    );

    userEvent.type(nameField, "{selectall}{backspace}new name{enter}");

    expect(updateExpression).toHaveBeenCalledTimes(1);
    expect(updateExpression).toHaveBeenCalledWith(
      "new name",
      expression,
      "old name",
    );
    expect(addExpression).toHaveBeenCalledTimes(0);
    expect(updateQuery).toHaveBeenCalledTimes(1);
  });
});

const createMockQueryForExpressions = () => {
  const state = createMockState({
    entities: createEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });

  const metadata = getMetadata(state);
  const query = metadata.table(ORDERS_ID)?.query();

  return query;
};

function setup(
  additionalProps?: Partial<ExpressionStepProps>,
  expressions?: Record<string, Expression>,
) {
  const updateQuery = jest.fn();
  const addExpression = jest.fn();
  const updateExpression = jest.fn();
  const removeExpression = jest.fn();

  let query = createMockQueryForExpressions();

  if (expressions) {
    Object.entries(expressions).forEach(([name, expression]) => {
      query = query.addExpression(name, expression);
    });
  }

  query.addExpression = addExpression;
  query.updateExpression = updateExpression;
  query.removeExpression = removeExpression;

  const props = {
    color: "#93A1AB",
    query,
    updateQuery,
    isLastOpened: false,
    reportTimezone: "UTC",
    ...additionalProps,
  };

  render(<ExpressionStep {...props} />);

  return {
    props,
    mocks: { addExpression, updateExpression, removeExpression },
  };
}
