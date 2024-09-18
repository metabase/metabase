import type { ComponentProps } from "react";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import { ORDERS, PEOPLE, PRODUCTS, PRODUCTS_ID, createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { NotebookStepList } from "./NotebookStepList";

const ORDERS_PRODUCT_JOIN_CONDITION = [
  "=",
  ["field", ORDERS.PRODUCT_ID, null],
  ["field", PRODUCTS.ID, { "join-alias": "Products" }],
];

const ORDERS_PEOPLE_JOIN_CONDITION = [
  "=",
  ["field", ORDERS.USER_ID, null],
  ["field", PEOPLE.ID, { "join-alias": "People" }],
];
const RANDOM_ORDER_ID = 155;

const PRODUCTS_JOIN = {
  alias: "Products",
  condition: ORDERS_PRODUCT_JOIN_CONDITION,
  "source-table": PRODUCTS_ID,
};
const ORDERS_PK_FILTER = ["=", ["field", ORDERS.ID, null], RANDOM_ORDER_ID];

type SetupOpts = Partial<ComponentProps<typeof NotebookStepList>>;

function setup(opts: SetupOpts = {}) {
  const database = createSampleDatabase();
  const reportTimezone = "UTC";

  const card = createMockCard({
    dataset_query: createMockStructuredDatasetQuery({
      query: {
        "source-table": 1,
        // joins: [PRODUCTS_JOIN],
        filter: ["and", ORDERS_PK_FILTER],
      }
    }),
  });
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
  it("renders a list of actions in correct order", () => {
    setup();

    const actionButtonsContainer = screen.getAllByTestId(
      "action-buttons",
    ).at(-1) as HTMLElement;
    const buttons = actionButtonsContainer.querySelectorAll("button");

    screen.logTestingPlaygroundURL();

    expect(buttons[0]).toHaveTextContent("Join data");
    expect(buttons[1]).toHaveTextContent("Custom column");
    expect(buttons[2]).toHaveTextContent("Filter");
    expect(buttons[3]).toHaveTextContent("Summarize");
    expect(buttons[4]).toHaveTextContent("Sort");
    expect(buttons[5]).toHaveTextContent("Row limit");
  });
});
