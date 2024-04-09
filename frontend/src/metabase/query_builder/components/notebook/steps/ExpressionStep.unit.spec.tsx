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
    query,
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
      stageIndex={step.stageIndex}
      query={step.query}
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

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));

    await userEvent.type(screen.getByLabelText("Expression"), "1 + 1");
    await userEvent.type(
      screen.getByLabelText("Name"),
      "new expression{enter}",
    );

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

    await userEvent.click(screen.getByText("old name"));

    const nameField = screen.getByLabelText("Name");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "new name{enter}");

    const recentQuery = getRecentQuery();
    const expressions = Lib.expressions(recentQuery, 0);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(recentQuery, 0, expressions[0]).displayName).toBe(
      "new name",
    );
  });

  it("should handle removing existing expression", async () => {
    const query = createQueryWithClauses({
      expressions: [{ name: "expression name", operator: "+", args: [1, 1] }],
    });
    const { getRecentQuery } = setup({ query });

    const expressionItem = screen.getByText("expression name");
    const closeIcon = within(expressionItem).getByRole("img", {
      name: "close icon",
    });

    await userEvent.click(closeIcon);

    expect(Lib.expressions(getRecentQuery(), 0)).toHaveLength(0);
  });

  it("should handle expressions named as existing columns (metabase#39508)", async () => {
    const { getRecentQuery } = setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));

    await userEvent.type(screen.getByLabelText("Expression"), "1 + 1");
    await userEvent.type(screen.getByLabelText("Name"), "Total{enter}");

    const recentQuery = getRecentQuery();
    const expressions = Lib.expressions(recentQuery, 0);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(recentQuery, 0, expressions[0]).displayName).toBe(
      "Total",
    );
  });
});
