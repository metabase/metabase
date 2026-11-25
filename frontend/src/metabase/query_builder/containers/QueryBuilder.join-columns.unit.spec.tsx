import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockGetBoundingClientRect, screen, within } from "__support__/ui";
import { serializeCardForUrl } from "metabase/common/utils/card";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollectionItem,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import { PRODUCTS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { TEST_DB, setup } from "./test-utils";

const Q1 = createMockCard({
  id: 401,
  name: "Q1",
  database_id: SAMPLE_DB_ID,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
        breakouts: [{ type: "column", name: "CATEGORY" }],
      },
    ],
  }),
});

const Q2 = createMockCard({
  id: 402,
  name: "Q2",
  database_id: SAMPLE_DB_ID,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [
          {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", name: "PRICE" }],
          },
        ],
        breakouts: [{ type: "column", name: "CATEGORY" }],
      },
    ],
  }),
});

const Q3 = createMockCard({
  id: 403,
  name: "Q3",
  database_id: SAMPLE_DB_ID,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [
          {
            type: "operator",
            operator: "avg",
            args: [{ type: "column", name: "RATING" }],
          },
        ],
        breakouts: [{ type: "column", name: "CATEGORY" }],
      },
    ],
  }),
});

const CARDS = [Q1, Q2, Q3];

const CARDS_PROVIDER = createMetadataProvider({
  metadata: createMockMetadata({ databases: [TEST_DB], questions: CARDS }),
});

// Q1 joined to Q2 on Category = Category, as built in the notebook
const Q1_JOIN_Q2_CARD = createMockUnsavedCard({
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(CARDS_PROVIDER, {
      stages: [
        {
          source: { type: "card", id: Q1.id },
          joins: [
            {
              source: { type: "card", id: Q2.id },
              strategy: "left-join",
              conditions: [
                {
                  operator: "=",
                  left: { type: "column", name: "CATEGORY" },
                  right: { type: "column", name: "CATEGORY" },
                },
              ],
            },
          ],
        },
      ],
    }),
  ),
});

describe("QueryBuilder > notebook joins on saved questions", () => {
  mockGetBoundingClientRect();

  it("should show all columns when using the join column selector (metabase#19894)", async () => {
    setupCardsEndpoints([Q1, Q2]);
    setupCardEndpoints(Q3);
    setupCardQueryMetadataEndpoint(
      Q3,
      createMockCardQueryMetadata({ databases: [TEST_DB], cards: [Q3] }),
    );
    await setup({
      card: Q1_JOIN_Q2_CARD,
      initialRoute: `/question/notebook#${serializeCardForUrl(Q1_JOIN_Q2_CARD)}`,
      metadata: createMockCardQueryMetadata({
        databases: [TEST_DB],
        cards: [Q1, Q2],
      }),
    });
    setupSearchEndpoints(
      CARDS.map((card) =>
        createMockCollectionItem({
          id: card.id,
          name: card.name,
          model: "card",
          database_id: SAMPLE_DB_ID,
        }),
      ),
    );

    const joinStep = await screen.findByTestId("step-join-0-0");
    expect(
      within(within(joinStep).getByLabelText("Right table")).getByText("Q2"),
    ).toBeInTheDocument();

    const actionButtons = screen.getByTestId("action-buttons");
    await userEvent.click(
      within(actionButtons).getByRole("button", { name: "Join data" }),
    );

    const secondJoinStep = await screen.findByTestId("step-join-0-1");
    const rightTableInput = within(
      within(secondJoinStep).getByLabelText("Right table"),
    ).getByRole("textbox");
    await userEvent.type(rightTableInput, "Q3");
    await userEvent.click(await screen.findByRole("menuitem", { name: /Q3/ }));

    const lhsColumnPicker = await screen.findByTestId("lhs-column-picker");
    expect(
      await within(lhsColumnPicker).findByText("Category"),
    ).toBeInTheDocument();
    expect(within(lhsColumnPicker).getByText("Count")).toBeInTheDocument();

    await userEvent.click(within(lhsColumnPicker).getByText("Q1"));
    await userEvent.click(within(lhsColumnPicker).getByText("Q2"));

    expect(
      within(lhsColumnPicker).getByText("Q2 - Category → Category"),
    ).toBeInTheDocument();
    expect(
      within(lhsColumnPicker).getByText("Q2 - Category → Sum of Price"),
    ).toBeInTheDocument();
    expect(
      within(lhsColumnPicker).queryByText("Count"),
    ).not.toBeInTheDocument();

    await userEvent.click(within(lhsColumnPicker).getByText("Q1"));

    expect(within(lhsColumnPicker).getByText("Category")).toBeInTheDocument();
    expect(within(lhsColumnPicker).getByText("Count")).toBeInTheDocument();
  });
});
