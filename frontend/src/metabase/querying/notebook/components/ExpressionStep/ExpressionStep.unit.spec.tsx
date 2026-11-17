import userEvent from "@testing-library/user-event";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  ORDERS_ID,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../test-utils";

import { ExpressionStep } from "./ExpressionStep";

interface SetupOpts {
  query?: Lib.Query;
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

  const { unmount } = renderWithProviders(
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

  return { getRecentQuery, unmount };
}

function createProductsQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
  });
}

function getExpressionNames(query: Lib.Query) {
  return Lib.expressions(query, 0).map(
    (expression) => Lib.displayInfo(query, 0, expression).displayName,
  );
}

/** Adds a custom column through the step's popover and returns the next query. */
async function addExpression(
  query: Lib.Query,
  { formula, name }: { formula: string; name: string },
) {
  const { getRecentQuery, unmount } = setup({ query });

  await userEvent.click(screen.getByRole("img", { name: "add icon" }));
  const input = await screen.findByTestId("custom-expression-query-editor");
  // `[[` types a literal `[` in user-event
  await userEvent.type(input, formula.replaceAll("[", "[["));
  await act(async () => {
    input.blur();
  });
  await userEvent.type(screen.getByTestId("expression-name"), name);
  await userEvent.click(screen.getByRole("button", { name: "Done" }));

  const nextQuery = getRecentQuery();
  unmount();
  return nextQuery;
}

describe("Notebook Editor > Expression Step", () => {
  beforeEach(() => {
    setupDatabaseEndpoints(createSampleDatabase());
  });

  it("should handle adding expression", async () => {
    const { getRecentQuery } = setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));

    const input = await screen.findByTestId("custom-expression-query-editor");
    await userEvent.type(input, "1 + 1");
    await act(async () => {
      input.blur();
    });

    await userEvent.type(
      screen.getByTestId("expression-name"),
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
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          expressions: [
            {
              name: "old name",
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
    const { getRecentQuery } = setup({ query });

    await userEvent.click(screen.getByText("old name"));

    const nameField = screen.getByTestId("expression-name");
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
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          expressions: [
            {
              name: "expression name",
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

    const input = await screen.findByTestId("custom-expression-query-editor");
    await userEvent.type(input, "1 + 1");
    await act(async () => {
      input.blur();
    });
    await userEvent.type(screen.getByTestId("expression-name"), "Total{enter}");

    const recentQuery = getRecentQuery();
    const expressions = Lib.expressions(recentQuery, 0);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(recentQuery, 0, expressions[0]).displayName).toBe(
      "Total (1)",
    );
  });

  it("should append indexes to duplicate custom column names (metabase#12104)", async () => {
    let query = createProductsQuery();
    for (let index = 0; index < 3; index++) {
      query = await addExpression(query, {
        formula: "[Category]",
        name: "EXPR",
      });
    }
    expect(getExpressionNames(query)).toEqual(["EXPR", "EXPR (1)", "EXPR (2)"]);

    setup({ query });
    expect(screen.getByText("EXPR")).toBeInTheDocument();
    expect(screen.getByText("EXPR (1)")).toBeInTheDocument();
    expect(screen.getByText("EXPR (2)")).toBeInTheDocument();
  });

  it("should handle custom columns that reference other custom columns", async () => {
    let query = createProductsQuery();
    query = await addExpression(query, { formula: "[Price]", name: "Foo" });
    query = await addExpression(query, { formula: "[Foo]", name: "Bar" });
    query = await addExpression(query, { formula: "[Bar]", name: "Quu" });
    expect(getExpressionNames(query)).toEqual(["Foo", "Bar", "Quu"]);

    setup({ query });
    for (const [name, formula] of [
      ["Foo", "[Price]"],
      ["Bar", "[Foo]"],
      ["Quu", "[Bar]"],
    ]) {
      await userEvent.click(screen.getByText(name));
      expect(
        await screen.findByTestId("custom-expression-query-editor"),
      ).toHaveValue(formula);
      expect(screen.getByTestId("expression-name")).toHaveValue(name);
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() =>
        expect(
          screen.queryByTestId("custom-expression-query-editor"),
        ).not.toBeInTheDocument(),
      );
    }
  });
});
