import userEvent from "@testing-library/user-event";
import { render, screen, within } from "__support__/ui";

import * as Lib from "metabase-lib";
import { createQueryWithClauses } from "metabase-lib/test-helpers";

import { createMockNotebookStep } from "../test-utils";
import { ExpressionStep } from "./ExpressionStep";

function setup({ query }: { query: Lib.Query }) {
  const updateQuery = jest.fn();

  const step = createMockNotebookStep({
    type: "expression",
    topLevelQuery: query,
  });

  function getRecentQuery() {
    expect(updateQuery).toHaveBeenCalledWith(expect.anything());
    const [recentQuery] = updateQuery.mock.lastCall;
    return recentQuery;
  }

  render(
    <ExpressionStep
      step={step}
      color="#93A1AB"
      query={step.query}
      topLevelQuery={step.topLevelQuery}
      updateQuery={updateQuery}
      isLastOpened={false}
      reportTimezone="UTC"
    />,
  );

  return {
    getRecentQuery,
    mocks: { updateQuery },
  };
}

describe("Notebook Editor > Expression Step", () => {
  it("should handle updating existing expression", async () => {
    const query = createQueryWithClauses({
      expressions: [{ name: "old name", operator: "+", args: [1, 1] }],
    });
    const { getRecentQuery } = setup({ query });

    userEvent.click(screen.getByText("old name"));

    const nameField = await screen.findByPlaceholderText(
      "Something nice and descriptive",
    );

    userEvent.clear(nameField);
    userEvent.type(nameField, "new name{enter}");

    const recentQuery = getRecentQuery();
    const expressions = Lib.expressions(recentQuery, 0);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(query, 0, expressions[0]).displayName).toBe(
      "new name",
    );
  });

  it("should handle removing existing expression", () => {
    const query = createQueryWithClauses({
      expressions: [{ name: "expression name", operator: "+", args: [1, 1] }],
    });
    const { getRecentQuery } = setup({ query });

    const expressionItem = screen.getByText("expression name");
    const closeIcon = within(expressionItem).getByRole("img", {
      name: `close icon`,
    });

    userEvent.click(closeIcon);

    expect(Lib.expressions(getRecentQuery(), 0)).toHaveLength(0);
  });
});
