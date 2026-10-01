import userEvent from "@testing-library/user-event";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { act, renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../test-utils";

import { ExpressionStep } from "./ExpressionStep";

interface SetupOpts {
  query?: Lib.Query;
}

function createQueryWithExpression(name: string) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },
        expressions: [
          {
            name,
            value: {
              type: "operator",
              operator: "+",
              args: [
                { type: "literal", value: 1 },
                { type: "literal", value: 1 },
              ],
            },
          },
        ],
      },
    ],
  });
}

function setup({
  query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
}: SetupOpts = {}) {
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

  function getExpressionNames(query: Lib.Query): string[] {
    return Lib.expressions(query, 0).map(
      (expression) => Lib.displayInfo(query, 0, expression).displayName,
    );
  }

  setupDatabaseEndpoints(createSampleDatabase());

  renderWithProviders(
    <ExpressionStep
      step={step}
      // @ts-expect-error unit test
      color="#93A1AB"
      stageIndex={step.stageIndex}
      query={step.query}
      updateQuery={updateQuery}
      isLastOpened={false}
      reportTimezone="UTC"
    />,
  );

  return { updateQuery, getRecentQuery, getExpressionNames };
}

async function typeExpression(source: string) {
  const input = await screen.findByTestId("custom-expression-query-editor");
  await userEvent.type(input, source);
  await act(async () => {
    input.blur();
  });
  return input;
}

describe("Notebook Editor > Expression Step", () => {
  it("should save an expression as soon as it compiles, without waiting for a name", async () => {
    const { getRecentQuery, getExpressionNames } = setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));
    await typeExpression("1 + 1");

    expect(getExpressionNames(getRecentQuery())).toEqual(["New column"]);
  });

  it("should rename an expression by clicking its open pill", async () => {
    const { getRecentQuery, getExpressionNames } = setup({
      query: createQueryWithExpression("old name"),
    });

    await userEvent.click(screen.getByText("old name"));
    await userEvent.click(screen.getByText("old name"));

    const input = screen.getByRole("textbox", { name: "old name" });
    await userEvent.clear(input);
    await userEvent.type(input, "new name");
    await act(async () => {
      input.blur();
    });

    expect(getExpressionNames(getRecentQuery())).toEqual(["new name"]);
  });

  it("should not rename an expression when the name is cleared", async () => {
    const { updateQuery } = setup({
      query: createQueryWithExpression("old name"),
    });

    await userEvent.click(screen.getByText("old name"));
    await userEvent.click(screen.getByText("old name"));

    const input = screen.getByRole("textbox", { name: "old name" });
    await userEvent.clear(input);
    await act(async () => {
      input.blur();
    });

    expect(updateQuery).not.toHaveBeenCalled();
    expect(screen.getByText("old name")).toBeInTheDocument();
  });

  it("should handle removing an existing expression", async () => {
    const { getRecentQuery } = setup({
      query: createQueryWithExpression("expression name"),
    });

    const pill = screen.getByText("expression name");
    await userEvent.click(
      within(pill).getByRole("img", { name: "close icon" }),
    );

    expect(Lib.expressions(getRecentQuery(), 0)).toHaveLength(0);
  });

  it("should give an expression a unique name when it collides with a column (metabase#39508)", async () => {
    const { getRecentQuery, getExpressionNames } = setup({
      query: createQueryWithExpression("New column"),
    });

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));
    await typeExpression("2 + 2");

    expect(getExpressionNames(getRecentQuery())).toEqual([
      "New column",
      "New column (1)",
    ]);
  });

  it("should offer Discard, not Revert, for a draft that never compiled", async () => {
    setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));
    await typeExpression("1 +");

    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revert to saved" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(
      screen.queryByTestId("inline-expression-editor"),
    ).not.toBeInTheDocument();
  });

  it("should offer Revert to saved once the expression has been saved", async () => {
    setup({ query: createQueryWithExpression("saved") });

    await userEvent.click(screen.getByText("saved"));
    const input = await screen.findByTestId("custom-expression-query-editor");
    await userEvent.clear(input);
    await userEvent.type(input, "1 +");
    await act(async () => {
      input.blur();
    });

    expect(
      await screen.findByRole("button", { name: "Revert to saved" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Discard" }),
    ).not.toBeInTheDocument();
  });

  it("should close the editor on Done", async () => {
    setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));
    await typeExpression("1 + 1");

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(
      screen.queryByTestId("inline-expression-editor"),
    ).not.toBeInTheDocument();
  });
});
