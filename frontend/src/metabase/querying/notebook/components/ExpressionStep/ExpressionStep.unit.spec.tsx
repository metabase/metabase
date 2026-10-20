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
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DEBOUNCE_VALIDATION_MS } from "../../../components/expressions/Editor/constants";
import { createMockNotebookStep } from "../../test-utils";

import { ExpressionStep } from "./ExpressionStep";

interface SetupOpts {
  query?: Lib.Query;
}

function createQueryWithExpressions(...names: string[]) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },
        expressions: names.map((name) => ({
          name,
          value: {
            type: "operator",
            operator: "+",
            args: [
              { type: "literal", value: 1 },
              { type: "literal", value: 1 },
            ],
          },
        })),
      },
    ],
  });
}

function createQueryWithExpression(name: string) {
  return createQueryWithExpressions(name);
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

async function combineColumns() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Shortcuts" }),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /Combine columns/ }),
  );
  await userEvent.click(
    within(await screen.findByTestId("expression-shortcut")).getByRole(
      "button",
      { name: "Done" },
    ),
  );
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

    const pill = screen.getByTestId("expression-pill");
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

  it("should keep in-progress text that does not compile when switching pills", async () => {
    setup({ query: createQueryWithExpressions("first", "second") });

    await userEvent.click(screen.getByText("first"));
    const input = await screen.findByTestId("custom-expression-query-editor");
    await userEvent.clear(input);
    await userEvent.type(input, "1 +");
    await act(async () => {
      input.blur();
    });

    // Go read the other expression, then come back.
    await userEvent.click(screen.getByText("second"));
    await userEvent.click(screen.getByText("first"));

    expect(
      await screen.findByTestId("custom-expression-query-editor"),
    ).toHaveValue("1 +");
  });

  it("should keep a draft and its text when switching to another pill", async () => {
    setup({ query: createQueryWithExpression("saved") });

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));
    await typeExpression("1 +");

    // Go look at the saved expression, then back to the draft.
    await userEvent.click(screen.getByText("saved"));
    expect(screen.getByText("New column")).toBeInTheDocument();

    await userEvent.click(screen.getByText("New column"));

    expect(
      await screen.findByTestId("custom-expression-query-editor"),
    ).toHaveValue("1 +");
  });

  it("should drop a draft when its pill is removed", async () => {
    setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));
    await typeExpression("1 +");

    const draft = screen.getByTestId("selected-expression-pill");
    await userEvent.click(
      within(draft).getByRole("img", { name: "close icon" }),
    );

    expect(screen.queryByText("New column")).not.toBeInTheDocument();
    expect(screen.queryByTestId("expression-editor")).not.toBeInTheDocument();
  });

  it("should flag pills whose text is not in the query", async () => {
    setup({ query: createQueryWithExpression("saved") });

    expect(screen.queryByTestId("unsaved-indicator")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("saved"));
    const input = await screen.findByTestId("custom-expression-query-editor");
    await userEvent.clear(input);
    await userEvent.type(input, "1 +");
    await act(async () => {
      input.blur();
    });

    expect(await screen.findByTestId("unsaved-indicator")).toBeInTheDocument();

    // Making it compile again clears the flag.
    await userEvent.type(input, " 1");
    await act(async () => {
      input.blur();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("unsaved-indicator")).not.toBeInTheDocument();
    });
  });

  it("should flag a draft as unsaved", async () => {
    setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));

    expect(screen.getByTestId("unsaved-indicator")).toBeInTheDocument();
  });

  it("should allow several drafts at once, each keeping its own text", async () => {
    setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));
    await typeExpression("1 +");

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));
    await typeExpression("2 +");

    expect(screen.getAllByText("New column")).toHaveLength(2);

    const [first, second] = screen.getAllByText("New column");
    await userEvent.click(first);
    expect(
      await screen.findByTestId("custom-expression-query-editor"),
    ).toHaveValue("1 +");

    await userEvent.click(second);
    expect(
      await screen.findByTestId("custom-expression-query-editor"),
    ).toHaveValue("2 +");
  });

  it("should not duplicate a column when the debounce and the blur both commit", async () => {
    const { getRecentQuery, getExpressionNames } = setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));

    const input = await screen.findByTestId("custom-expression-query-editor");
    await userEvent.type(input, "2 + 2");

    // Let the debounced validation commit before blurring commits again.
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_VALIDATION_MS + 50);
    });
    await act(async () => {
      input.blur();
    });

    expect(getExpressionNames(getRecentQuery())).toEqual(["New column"]);
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

  describe("shortcuts", () => {
    it("should name a new column after the combined columns", async () => {
      const { getRecentQuery, getExpressionNames } = setup();

      await userEvent.click(screen.getByRole("img", { name: "add icon" }));
      await combineColumns();

      expect(getExpressionNames(getRecentQuery())).toEqual([
        expect.stringMatching(/^Combined /),
      ]);
    });

    it("should replace a default name", async () => {
      const { getRecentQuery, getExpressionNames } = setup({
        query: createQueryWithExpression("New column"),
      });

      await userEvent.click(screen.getByText("New column"));
      await combineColumns();

      expect(getExpressionNames(getRecentQuery())).toEqual([
        expect.stringMatching(/^Combined /),
      ]);
    });

    it("should keep a name the user chose", async () => {
      const { getRecentQuery, getExpressionNames } = setup({
        query: createQueryWithExpression("Net total"),
      });

      await userEvent.click(screen.getByText("Net total"));
      await combineColumns();

      const query = getRecentQuery();
      const [expression] = Lib.expressions(query, 0);
      expect(getExpressionNames(query)).toEqual(["Net total"]);
      expect(Lib.expressionParts(query, 0, expression)).toMatchObject({
        operator: "concat",
      });
    });
  });
});
