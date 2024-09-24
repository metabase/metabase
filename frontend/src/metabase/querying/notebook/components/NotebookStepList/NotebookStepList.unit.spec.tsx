/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["assertActionButtonsOrder"] }] */
import type { ComponentProps } from "react";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card, Filter, JoinCondition } from "metabase-types/api";
import {
  createMockCard,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { NotebookStepList } from "./NotebookStepList";

const ORDERS_PRODUCT_JOIN_CONDITION: JoinCondition = [
  "=",
  ["field", ORDERS.PRODUCT_ID, null],
  ["field", PRODUCTS.ID, { "join-alias": "Products" }],
];

const PRODUCTS_JOIN = {
  alias: "Products",
  condition: ORDERS_PRODUCT_JOIN_CONDITION,
  "source-table": PRODUCTS_ID,
};
const ORDERS_FILTER: Filter = [">", ["field", ORDERS.TAX, null], 10];

type SetupOpts = Partial<ComponentProps<typeof NotebookStepList>>;

function setup(opts: SetupOpts = {}, card: Card) {
  const database = createSampleDatabase();
  const reportTimezone = "UTC";

  const state = createMockState({
    qb: createMockQueryBuilderState({
      card,
    }),
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });
  const metadata = getMetadata(state);
  const question = new Question(card, metadata);

  renderWithProviders(
    <NotebookStepList
      question={question}
      reportTimezone={reportTimezone}
      updateQuestion={jest.fn()}
      {...opts}
    />,
    {
      storeInitialState: state,
    },
  );
}

describe("NotebookStepList", () => {
  it("renders a list of actions for data step", () => {
    const card = createMockCard({
      dataset_query: createMockStructuredDatasetQuery({
        query: {
          "source-table": ORDERS_ID,
        },
      }),
    });

    setup({}, card);

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
    const card = createMockCard({
      dataset_query: createMockStructuredDatasetQuery({
        query: {
          "source-table": ORDERS_ID,
          joins: [PRODUCTS_JOIN],
        },
      }),
    });
    setup({}, card);

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
    const card = createMockCard({
      dataset_query: createMockStructuredDatasetQuery({
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            "Custom column": ["+", 1, 1],
          },
        },
      }),
    });
    setup({}, card);

    assertActionButtonsOrder(["Filter", "Summarize", "Sort", "Row limit"]);
  });

  it("renders a list of actions for Filter step", () => {
    const card = createMockCard({
      dataset_query: createMockStructuredDatasetQuery({
        query: {
          "source-table": ORDERS_ID,
          filter: ORDERS_FILTER,
        },
      }),
    });
    setup({}, card);

    assertActionButtonsOrder(["Summarize", "Sort", "Row limit"]);
  });

  it("renders a list of actions for Summarize step", () => {
    const card = createMockCard({
      dataset_query: createMockStructuredDatasetQuery({
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, null]],
        },
      }),
    });
    setup({}, card);

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
