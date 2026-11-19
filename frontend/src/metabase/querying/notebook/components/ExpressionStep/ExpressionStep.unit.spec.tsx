import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
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

  return { getRecentQuery };
}

interface SetupWithQueryUpdatesOpts {
  query: Lib.Query;
}

function setupWithQueryUpdates({ query }: SetupWithQueryUpdatesOpts) {
  const onQueryChange = jest.fn<void, [Lib.Query]>();

  setupDatabaseEndpoints(createSampleDatabase());

  function ExpressionStepWithQueryUpdates() {
    const [currentQuery, setCurrentQuery] = useState(query);
    const step = createMockNotebookStep({
      type: "expression",
      query: currentQuery,
    });

    const handleUpdateQuery = async (nextQuery: Lib.Query) => {
      setCurrentQuery(nextQuery);
      onQueryChange(nextQuery);
    };

    return (
      <ExpressionStep
        step={step}
        color="text-disabled"
        stageIndex={step.stageIndex}
        query={step.query}
        updateQuery={handleUpdateQuery}
        isLastOpened={false}
        reportTimezone="UTC"
      />
    );
  }

  renderWithProviders(<ExpressionStepWithQueryUpdates />);

  function getRecentQuery(): Lib.Query {
    expect(onQueryChange).toHaveBeenCalled();
    const [recentQuery] = checkNotNull(onQueryChange.mock.lastCall);
    return recentQuery;
  }

  function getRecentExpressionNames(): string[] {
    const recentQuery = getRecentQuery();
    return Lib.expressions(recentQuery, 0).map(
      (expression) => Lib.displayInfo(recentQuery, 0, expression).displayName,
    );
  }

  return { getRecentQuery, getRecentExpressionNames };
}

async function addExpression({
  formula,
  name,
}: {
  formula: string;
  name: string;
}) {
  await userEvent.click(screen.getByRole("img", { name: "add icon" }));

  const input = await screen.findByTestId("custom-expression-query-editor");
  await userEvent.type(input, formula);
  await act(async () => {
    input.blur();
  });

  await userEvent.type(screen.getByTestId("expression-name"), `${name}{enter}`);
}

function createProductsQueryWithExpressionReferences() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        expressions: [
          { name: "Foo", value: { type: "column", name: "PRICE" } },
          { name: "Bar", value: { type: "column", name: "Foo" } },
          { name: "Quu", value: { type: "column", name: "Bar" } },
        ],
      },
    ],
  });
}

function createProductsQueryWithInExpression() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        expressions: [
          {
            name: "Price plus one",
            value: {
              type: "operator",
              operator: "+",
              args: [
                { type: "column", name: "PRICE" },
                { type: "literal", value: 1 },
              ],
            },
          },
          {
            name: "InColumn",
            value: {
              type: "operator",
              operator: "in",
              args: [
                { type: "literal", value: "Gadget" },
                { type: "column", name: "VENDOR" },
                { type: "column", name: "CATEGORY" },
              ],
            },
          },
        ],
      },
    ],
  });
}

describe("Notebook Editor > Expression Step", () => {
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
      "Total",
    );
  });

  it("should append indexes to duplicate custom expression names (metabase#12104)", async () => {
    const { getRecentExpressionNames } = setupWithQueryUpdates({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
      }),
    });

    await addExpression({ formula: "[[Category]", name: "EXPR" });
    expect(await screen.findByText("EXPR")).toBeInTheDocument();
    expect(getRecentExpressionNames()).toEqual(["EXPR"]);

    await addExpression({ formula: "[[Category]", name: "EXPR" });
    expect(await screen.findByText("EXPR (1)")).toBeInTheDocument();
    expect(getRecentExpressionNames()).toEqual(["EXPR", "EXPR (1)"]);

    await addExpression({ formula: "[[Category]", name: "EXPR" });
    expect(await screen.findByText("EXPR (2)")).toBeInTheDocument();
    expect(screen.getByText("EXPR")).toBeInTheDocument();
    expect(screen.getByText("EXPR (1)")).toBeInTheDocument();
    expect(getRecentExpressionNames()).toEqual([
      "EXPR",
      "EXPR (1)",
      "EXPR (2)",
    ]);
  });

  it.each([
    ["Foo", "[Price]"],
    ["Bar", "[Foo]"],
    ["Quu", "[Bar]"],
  ])(
    "should open the %s expression that references another column with its own formula",
    async (expressionName, expectedFormula) => {
      setup({ query: createProductsQueryWithExpressionReferences() });

      await userEvent.click(screen.getByText(expressionName));

      const editor = await screen.findByTestId(
        "custom-expression-query-editor",
      );
      await waitFor(() => expect(editor).toHaveValue(expectedFormula));
      expect(screen.getByTestId("expression-name")).toHaveValue(expressionName);
    },
  );
  it("should replace an `in` custom column with `notIn` in place, keeping its name", async () => {
    const { getRecentQuery, getRecentExpressionNames } = setupWithQueryUpdates({
      query: createProductsQueryWithInExpression(),
    });

    await userEvent.click(screen.getByText("InColumn"));
    const input = await screen.findByTestId("custom-expression-query-editor");
    await waitFor(() =>
      expect(input).toHaveValue('in("Gadget", [Vendor], [Category])'),
    );
    await userEvent.clear(input);
    await userEvent.type(input, 'notIn("Gadget", [[Vendor], [[Category])');
    await act(async () => {
      input.blur();
    });
    expect(screen.getByTestId("expression-name")).toHaveValue("InColumn");
    const updateButton = screen.getByRole("button", { name: "Update" });
    await waitFor(() => expect(updateButton).toBeEnabled());
    await userEvent.click(updateButton);

    expect(getRecentExpressionNames()).toEqual(["Price plus one", "InColumn"]);
    expect(screen.getByText("Price plus one")).toBeInTheDocument();
    expect(screen.getByText("InColumn")).toBeInTheDocument();

    const recentQuery = getRecentQuery();
    const [otherExpression, inColumnExpression] = Lib.expressions(
      recentQuery,
      0,
    );
    expect(
      Lib.expressionParts(recentQuery, 0, inColumnExpression),
    ).toMatchObject({
      operator: "not-in",
      args: ["Gadget", expect.anything(), expect.anything()],
    });
    expect(Lib.expressionParts(recentQuery, 0, otherExpression)).toMatchObject({
      operator: "+",
      args: [expect.anything(), 1],
    });
  });
});
