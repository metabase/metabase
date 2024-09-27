/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["assertActionButtonsOrder"] }] */
import type { ComponentProps } from "react";

import { createMockMetadata } from "__support__/metadata";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { NotebookStepList } from "./NotebookStepList";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

type SetupOpts = Partial<ComponentProps<typeof NotebookStepList>>;

function setup(opts: SetupOpts = {}, query: Lib.Query = createQuery()) {
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
    <NotebookStepList
      question={question}
      reportTimezone={reportTimezone}
      updateQuestion={jest.fn()}
      {...opts}
    />,
    {
      storeInitialState: state,
      withNotebook: true,
    },
  );
}

describe("NotebookStepList", () => {
  it("renders a list of actions for data step", () => {
    setup();

    assertActionButtonsOrder([
      "Join data",
      "Custom column",
      "Filter",
      "Summarize",
      "Sort",
      "Row limit",
    ]);
  });

  it("renders a list of actions for join step", () => {
    const query = createQuery();
    const joinTable = Lib.tableOrCardMetadata(query, PRODUCTS_ID);
    const queryWithJoin = Lib.join(
      query,
      -1,
      Lib.joinClause(
        joinTable,
        [
          Lib.joinConditionClause(
            query,
            -1,
            Lib.joinConditionOperators(query, -1)[0],
            Lib.joinConditionLHSColumns(query, -1)[0],
            Lib.joinConditionRHSColumns(query, -1, joinTable)[0],
          ),
        ],
        Lib.availableJoinStrategies(query, -1)[0],
      ),
    );
    setup({}, queryWithJoin);

    assertActionButtonsOrder([
      "Join data",
      "Custom column",
      "Filter",
      "Summarize",
      "Sort",
      "Row limit",
    ]);
  });

  it("renders a list of actions for Custom column step", () => {
    const query = createQueryWithClauses({
      expressions: [
        {
          name: "Custom Column",
          operator: "+",
          args: [1, 1],
        },
      ],
    });
    setup({}, query);

    assertActionButtonsOrder(["Filter", "Summarize", "Sort", "Row limit"]);
  });

  it("renders a list of actions for Filter step", () => {
    const queryWithFilter = Lib.filter(
      createQuery(),
      -1,
      Lib.expressionClause("=", [1, 1]),
    );
    setup({}, queryWithFilter);

    assertActionButtonsOrder(["Summarize", "Sort", "Row limit"]);
  });

  it("renders a list of actions for Summarize step", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        {
          columnName: "CREATED_AT",
          tableName: "ORDERS",
          temporalBucketName: "Month",
        },
      ],
    });
    setup({}, query);

    assertActionButtonsOrder([
      "Sort",
      "Row limit",
      "Join data",
      "Custom column",
      "Filter",
      "Summarize",
    ]);
  });
});

function assertActionButtonsOrder(buttonNames: string[]) {
  const actionButtonsContainer = screen
    .getAllByTestId("action-buttons")
    .at(-1) as HTMLElement;
  const buttons = actionButtonsContainer.querySelectorAll("button");

  expect(buttons.length).toBe(buttonNames.length);
  buttonNames.forEach((name, index) => {
    expect(buttons[index]).toHaveTextContent(name);
  });
}
