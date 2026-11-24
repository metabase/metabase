import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { NotebookProvider } from "../Notebook/context";

import { NotebookStepList } from "./NotebookStepList";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

type SetupOpts = Partial<ComponentProps<typeof NotebookStepList>>;

function setup(
  opts: SetupOpts = {},
  query: Lib.Query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
) {
  const database = createSampleDatabase();
  const reportTimezone = "UTC";
  const question = new Question(createMockCard(), metadata).setQuery(query);

  const state = createMockState({
    qb: createMockQueryBuilderState({
      card: question.card(),
    }),
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });

  renderWithProviders(
    <NotebookProvider>
      <NotebookStepList
        question={question}
        reportTimezone={reportTimezone}
        updateQuestion={jest.fn()}
        {...opts}
      />
    </NotebookProvider>,
    {
      storeInitialState: state,
    },
  );
}

interface SetupWithQuestionUpdatesOpts {
  query: Lib.Query;
}

function setupWithQuestionUpdates({ query }: SetupWithQuestionUpdatesOpts) {
  const onQueryChange = jest.fn<void, [Lib.Query]>();
  const initialQuestion = new Question(createMockCard(), metadata).setQuery(
    query,
  );

  function NotebookStepListWithQuestionUpdates() {
    const [question, setQuestion] = useState(initialQuestion);

    const handleUpdateQuestion = async (nextQuestion: Question) => {
      setQuestion(nextQuestion);
      onQueryChange(nextQuestion.query());
    };

    return (
      <NotebookProvider>
        <NotebookStepList
          question={question}
          reportTimezone="UTC"
          updateQuestion={handleUpdateQuestion}
        />
      </NotebookProvider>
    );
  }

  renderWithProviders(<NotebookStepListWithQuestionUpdates />, {
    storeInitialState: createMockState({
      qb: createMockQueryBuilderState({ card: initialQuestion.card() }),
      entities: createMockEntitiesState({
        databases: [createSampleDatabase()],
      }),
    }),
  });

  function getRecentQuery(): Lib.Query {
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    const [recentQuery] = checkNotNull(onQueryChange.mock.lastCall);
    return recentQuery;
  }

  return { getRecentQuery };
}

function createQueryWithJoinedColumnExpression() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        joins: [
          {
            source: { type: "table", id: PRODUCTS_ID },
            strategy: "left-join",
          },
        ],
        expressions: [
          {
            name: "Double total",
            value: {
              type: "operator",
              operator: "*",
              args: [
                { type: "column", name: "TOTAL" },
                { type: "literal", value: 2 },
              ],
            },
          },
          {
            name: "Rounded price",
            value: {
              type: "operator",
              operator: "ceil",
              args: [{ type: "column", name: "PRICE", joinAlias: "Products" }],
            },
          },
        ],
      },
    ],
  });
}

describe("NotebookStepList", () => {
  it("should drop a custom column based on a joined column when the join is removed (metabase#14775)", async () => {
    const { getRecentQuery } = setupWithQuestionUpdates({
      query: createQueryWithJoinedColumnExpression(),
    });

    const expressionStep = screen.getByTestId("step-expression-0-0");
    expect(
      within(expressionStep).getByText("Rounded price"),
    ).toBeInTheDocument();
    expect(
      within(expressionStep).getByText("Double total"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("step-join-0-0")).getByRole("button", {
        name: "Remove step",
      }),
    );

    expect(screen.queryByTestId("step-join-0-0")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("step-expression-0-0")).queryByText(
        "Rounded price",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("step-expression-0-0")).getByText(
        "Double total",
      ),
    ).toBeInTheDocument();

    const recentQuery = getRecentQuery();
    expect(Lib.joins(recentQuery, 0)).toHaveLength(0);
    expect(
      Lib.expressions(recentQuery, 0).map(
        (expression) => Lib.displayInfo(recentQuery, 0, expression).displayName,
      ),
    ).toEqual(["Double total"]);
  });

  it("renders a list of actions for Summarize step with no breakouts", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
      ],
    });
    setup({}, query);

    assertActionButtonsOrder(["Join data", "Custom column"]);
  });
});

function assertActionButtonsOrder(buttonNames: string[]) {
  // Unjustified type cast. FIXME
  const actionButtonsContainer = screen
    .getAllByTestId("action-buttons")
    .at(-1) as HTMLElement;
  const buttons = within(actionButtonsContainer).getAllByRole("button");

  expect(buttons.length).toBe(buttonNames.length);
  buttonNames.forEach((name, index) => {
    expect(buttons[index]).toHaveAccessibleName(name);
  });
}
