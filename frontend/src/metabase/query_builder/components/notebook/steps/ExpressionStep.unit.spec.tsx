import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, within } from "__support__/ui";

import * as Lib from "metabase-lib";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";

import { createMockNotebookStep } from "../test-utils";
import { ExpressionStep } from "./ExpressionStep";

interface SetupOpts {
  query?: Lib.Query;
}

function setup({ query = createQuery() }: SetupOpts = {}) {
  const updateQuery = jest.fn();

  const step = createMockNotebookStep({
    type: "expression",
    topLevelQuery: query,
  });

  function getRecentQuery(): Lib.Query {
    expect(updateQuery).toHaveBeenCalledWith(expect.anything());
    const [recentQuery] = updateQuery.mock.lastCall;
    return recentQuery;
  }

  renderWithProviders(
    <ExpressionStep
      step={step}
      color="#93A1AB"
      query={step.query}
      stageIndex={step.stageIndex}
      topLevelQuery={step.topLevelQuery}
      updateQuery={updateQuery}
      isLastOpened={false}
      reportTimezone="UTC"
    />,
  );

  return { getRecentQuery };
}

describe("Notebook Editor > Expression Step", () => {
  it("should handle adding expression", async () => {
    const { getRecentQuery } = setup();

    userEvent.click(screen.getByRole("img", { name: "add icon" }));

    userEvent.type(screen.getByLabelText("Expression"), "1 + 1");
    userEvent.type(screen.getByLabelText("Name"), "new expression{enter}");

    const recentQuery = getRecentQuery();
    const expressions = Lib.expressions(recentQuery, 0);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(recentQuery, 0, expressions[0]).displayName).toBe(
      "new expression",
    );
  });

  it("should handle updating existing expression", async () => {
    const query = createQueryWithClauses({
      expressions: [{ name: "old name", operator: "+", args: [1, 1] }],
    });
    const { getRecentQuery } = setup({ query });

    userEvent.click(screen.getByText("old name"));

    const nameField = screen.getByLabelText("Name");
    userEvent.clear(nameField);
    userEvent.type(nameField, "new name{enter}");

    const recentQuery = getRecentQuery();
    const expressions = Lib.expressions(recentQuery, 0);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(recentQuery, 0, expressions[0]).displayName).toBe(
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
      name: "close icon",
    });

    userEvent.click(closeIcon);

    expect(Lib.expressions(getRecentQuery(), 0)).toHaveLength(0);
  });
});
