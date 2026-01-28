import userEvent from "@testing-library/user-event";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Card, Database, Table } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { ViewOnlyTag } from "./ViewOnly";

type SetupOpts = {
  card: Card;
  database?: Database;
  tables?: Table[];
  questions?: Card[];
};

function setup({
  card,
  tables,
  database = createSampleDatabase(),
  questions = [],
}: SetupOpts) {
  console.warn = jest.fn();

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
      questions: [...questions, card],
      tables,
    }),
  });

  const metadata = getMetadata(storeInitialState);
  const isSaved = card.id != null;
  const question = isSaved
    ? metadata.question(card.id)
    : new Question(card, metadata);

  if (!question) {
    throw new Error("question is null");
  }

  renderWithProviders(
    <div>
      <ViewOnlyTag question={question} />
    </div>,
    {
      storeInitialState,
    },
  );
}

async function expectNoPopover() {
  await userEvent.hover(screen.getByText("View-only"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
}

async function expectPopoverToHaveText(text: string) {
  await userEvent.hover(screen.getByText("View-only"));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toBeInTheDocument();
  expect(dialog).toHaveTextContent(text);
}

const HIDDEN_VISIBILITY_TYPES = ["hidden", "technical", "cruft"] as const;

const ORDERS_QUERY = (function () {
  const query = createQuery({ databaseId: SAMPLE_DB_ID });

  const availableColumns = Lib.fieldableColumns(query, -1);
  const columns = availableColumns.filter((column) => {
    const info = Lib.displayInfo(query, -1, column);
    return info.table?.name === "ORDERS" || info.table?.name === "PRODUCTS";
  });

  return Lib.withFields(query, -1, columns);
})();

const ORDERS_JOIN_PRODUCTS_QUERY = (function () {
  let query = createQuery({ databaseId: SAMPLE_DB_ID });
  const joinTable = checkNotNull(Lib.tableOrCardMetadata(query, PRODUCTS_ID));

  query = Lib.join(
    query,
    -1,
    Lib.joinClause(
      joinTable,
      [
        Lib.joinConditionClause(
          Lib.joinConditionOperators(query, -1)[0],
          Lib.joinConditionLHSColumns(query, -1)[0],
          Lib.joinConditionRHSColumns(query, -1, joinTable)[0],
        ),
      ],
      Lib.availableJoinStrategies(query, -1)[0],
    ),
  );

  return query;
})();

function createCardFromQuery({
  query,
  ...rest
}: Partial<Card> & { query: Lib.Query }): Card {
  return createMockCard({
    ...rest,
    dataset_query: Lib.toJsQuery(query),
  });
}

describe("ViewOnlyTag", () => {
  describe("cards", () => {
    it("should show the View-only badge when the source card is inaccessible", () => {
      setup({
        card: createCardFromQuery({
          query: createQuery({
            databaseId: SAMPLE_DB_ID,
            query: {
              database: SAMPLE_DB_ID,
              type: "query",
              query: {
                "source-table": "card__123",
              },
            },
          }),
        }),
      });

      expect(screen.getByText("View-only")).toBeInTheDocument();
      expectNoPopover();
    });

    it("should show the View-only badge when a joined card is inaccessible", () => {
      setup({
        card: createCardFromQuery({
          query: createQuery({
            query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": ORDERS_ID,
                joins: [
                  {
                    alias: "Orders Question",
                    fields: "all",
                    // This card does not exist
                    "source-table": "card__123",
                    condition: [
                      "=",
                      ["field", PRODUCTS.ID, null],
                      ["field", ORDERS.PRODUCT_ID, null],
                    ],
                  },
                ],
              },
            },
          }),
        }),
      });

      expect(screen.getByText("View-only")).toBeInTheDocument();
      expectNoPopover();
    });

    it("should not show the View-only badge when the source card is accessible", () => {
      const sourceCard = createMockCard({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
          },
        },
      });
      setup({
        questions: [sourceCard],
        card: createMockCard({
          dataset_query: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              // This card does not exist
              "source-table": `card__${sourceCard.id}`,
            },
          },
        }),
      });

      expect(screen.queryByText("View-only")).not.toBeInTheDocument();
    });

    it("should not show the View-only badge when the joined card is accessible", () => {
      const sourceCard = createMockCard({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
          },
        },
      });
      setup({
        card: createMockCard({
          dataset_query: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              joins: [
                {
                  alias: "Orders Question",
                  fields: "all",
                  "source-table": `card__${sourceCard.id}`,
                  condition: [
                    "=",
                    ["field", PRODUCTS.ID, null],
                    ["field", ORDERS.PRODUCT_ID, null],
                  ],
                },
              ],
            },
          },
        }),
      });

      expect(screen.queryByText("View-only")).not.toBeInTheDocument();
    });
  });

  describe("tables", () => {
    for (const visibility_type of HIDDEN_VISIBILITY_TYPES) {
      it(`should show the View-only badge when the source table is ${visibility_type}`, async () => {
        setup({
          card: createCardFromQuery({ query: ORDERS_JOIN_PRODUCTS_QUERY }),
          tables: [
            createOrdersTable({ visibility_type }),
            createProductsTable({ visibility_type: null }),
          ],
        });

        expect(screen.getByText("View-only")).toBeInTheDocument();
        await expectPopoverToHaveText(
          "One of the administrators hid the source table “Orders”, making this question view-only.",
        );
      });

      it(`should show the View-only badge when a joined table is ${visibility_type}`, async () => {
        setup({
          card: createCardFromQuery({ query: ORDERS_JOIN_PRODUCTS_QUERY }),
          tables: [
            createOrdersTable({ visibility_type: null }),
            createProductsTable({ visibility_type }),
          ],
        });

        expect(screen.getByText("View-only")).toBeInTheDocument();
        await expectPopoverToHaveText(
          "One of the administrators hid the source table “Products”, making this question view-only.",
        );
      });
    }
  });

  describe("implicit joins", () => {
    for (const visibility_type of HIDDEN_VISIBILITY_TYPES) {
      it(`should not show the View-only badge when an implicitly joined table is ${visibility_type}`, async () => {
        setup({
          card: createCardFromQuery({ query: ORDERS_QUERY }),
          tables: [
            createOrdersTable({ visibility_type: null }),
            createProductsTable({ visibility_type }),
          ],
        });

        expect(screen.queryByText("View-only")).not.toBeInTheDocument();
      });
    }
  });
});
