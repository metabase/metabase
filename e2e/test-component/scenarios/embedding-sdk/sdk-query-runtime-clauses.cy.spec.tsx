import { MetabaseProvider } from "@metabase/embedding-sdk-react";
import {
  type DefinedQuery,
  aggregations,
  breakout,
  defineQuery,
  filter,
  orderBy,
  useMetabaseQuery,
} from "@metabase/embedding-sdk-react/data-app";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  mountSdk,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";
import type { StructuredQuery } from "metabase-types/api";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS } = SAMPLE_DATABASE;

const tableSource = { type: "table" as const, id: ORDERS_ID };

const createdAtField = {
  type: "column" as const,
  fieldId: ORDERS.CREATED_AT,
  tableId: ORDERS_ID,
  name: "CREATED_AT",
  jsType: "Date" as const,
};
const userIdField = {
  type: "column" as const,
  fieldId: ORDERS.USER_ID,
  tableId: ORDERS_ID,
  name: "USER_ID",
  jsType: "number" as const,
};
const productIdField = {
  type: "column" as const,
  fieldId: ORDERS.PRODUCT_ID,
  tableId: ORDERS_ID,
  name: "PRODUCT_ID",
  jsType: "number" as const,
};
const totalField = {
  type: "column" as const,
  fieldId: ORDERS.TOTAL,
  tableId: ORDERS_ID,
  name: "TOTAL",
  jsType: "number" as const,
};
const subtotalField = {
  type: "column" as const,
  fieldId: ORDERS.SUBTOTAL,
  tableId: ORDERS_ID,
  name: "SUBTOTAL",
  jsType: "number" as const,
};
const productsIdField = {
  type: "column" as const,
  fieldId: PRODUCTS.ID,
  sourceFieldId: ORDERS.PRODUCT_ID,
  name: "ID",
  jsType: "number" as const,
};
const peopleIdField = {
  type: "column" as const,
  fieldId: PEOPLE.ID,
  sourceFieldId: ORDERS.USER_ID,
  name: "ID",
  jsType: "number" as const,
};

type QueryResult = { columns: { name: string }[]; rawRows: unknown[][] };
type QueryState = { data: QueryResult | null; error: unknown };

type RowCheck = (data: QueryResult) => string | null;

type UseQueryStates = (cardId: number) => {
  fromTable: QueryState;
  fromCard: QueryState;
};

const asCardQuery = <TQuery extends DefinedQuery>(cardId: number) =>
  // Public types admit only table sources; the card holds `TQuery`, so its
  // result columns match.
  ({ source: { type: "card", id: cardId } }) as unknown as TQuery;

const describeState = ({ data, error }: QueryState, check: RowCheck) =>
  error
    ? `error: ${String(error)}`
    : data === null
      ? "loading"
      : data.rawRows.length === 0
        ? "empty"
        : (check(data) ?? "ok");

function RuntimeClauses({
  cardId,
  useQueryStates,
  check,
}: {
  cardId: number;
  useQueryStates: UseQueryStates;
  check: RowCheck;
}) {
  const { fromTable, fromCard } = useQueryStates(cardId);

  return (
    <>
      <div data-testid="from-table">{describeState(fromTable, check)}</div>
      <div data-testid="from-card">{describeState(fromCard, check)}</div>
    </>
  );
}

const isSortedDescending = (values: unknown[]) =>
  values.every(
    (value, index) => index === 0 || Number(values[index - 1]) >= Number(value),
  );

describe("scenarios > embedding-sdk > query runtime clauses", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
  });

  const expectRuntimeClauses = ({
    cardQuery,
    useQueryStates,
    check,
  }: {
    cardQuery: StructuredQuery;
    useQueryStates: UseQueryStates;
    check: RowCheck;
  }) => {
    createQuestion({ name: "Runtime clauses source", query: cardQuery }).then(
      ({ body: card }) => {
        cy.signOut();
        mockAuthProviderAndJwtSignIn();

        mountSdk(
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <RuntimeClauses
              cardId={card.id}
              useQueryStates={useQueryStates}
              check={check}
            />
          </MetabaseProvider>,
        );

        cy.findByTestId("from-table", { timeout: 30000 }).should(
          "have.text",
          "ok",
        );
        cy.findByTestId("from-card", { timeout: 30000 }).should(
          "have.text",
          "ok",
        );
      },
    );
  };

  it("filters on a result column that a foreign key also makes joinable", () => {
    const staticQuery = defineQuery({
      source: tableSource,
      aggregations: [aggregations.count()],
      breakouts: [
        breakout(createdAtField, { unit: "month" }),
        breakout(userIdField),
      ],
    });
    const dynamicQuery = {
      filters: [filter(createdAtField, ">=", "2024-01-01")],
    };

    expectRuntimeClauses({
      cardQuery: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", ORDERS.USER_ID, null],
        ],
      },
      useQueryStates: (cardId) => ({
        fromTable: useMetabaseQuery(staticQuery, dynamicQuery),
        fromCard: useMetabaseQuery(
          asCardQuery<typeof staticQuery>(cardId),
          dynamicQuery,
        ),
      }),
      check: ({ rawRows }) => {
        const earlier = rawRows.find(
          ([createdAt]) => String(createdAt) < "2024-01-01",
        );
        return earlier ? `row before 2024: ${JSON.stringify(earlier)}` : null;
      },
    });
  });

  it("filters on one of two result columns with the same name", () => {
    // Generated joined fields are metric dimensions, and the skill requires
    // their metric in the same query. The metric is what loads the metadata of
    // the tables its foreign keys point to.
    createQuestion({
      name: "Orders count",
      type: "metric",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    }).then(({ body: metric }) => {
      const ordersCount = {
        type: "metric" as const,
        id: metric.id,
        sourceTableId: ORDERS_ID,
        mappedTableIds: [ORDERS_ID],
        columns: [{ name: "count", jsType: "number" as const }],
      };
      const staticQuery = defineQuery({
        source: tableSource,
        aggregations: [ordersCount],
        breakouts: [breakout(productsIdField), breakout(peopleIdField)],
      });
      const dynamicQuery = { filters: [filter(peopleIdField, "<", 10)] };

      expectRuntimeClauses({
        cardQuery: {
          "source-table": ORDERS_ID,
          aggregation: [["metric", metric.id]],
          breakout: [
            ["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PEOPLE.ID, { "source-field": ORDERS.USER_ID }],
          ],
        },
        useQueryStates: (cardId) => ({
          fromTable: useMetabaseQuery(staticQuery, dynamicQuery),
          fromCard: useMetabaseQuery(
            asCardQuery<typeof staticQuery>(cardId),
            dynamicQuery,
          ),
        }),
        check: ({ rawRows }) => {
          const outside = rawRows.find(
            ([, peopleId]) => Number(peopleId) >= 10,
          );
          return outside
            ? `row with people ID >= 10: ${JSON.stringify(outside)}`
            : null;
        },
      });
    });
  });

  describe("two aggregations of the same kind", () => {
    const staticQuery = defineQuery({
      source: tableSource,
      aggregations: [
        aggregations.sum(totalField),
        aggregations.sum(subtotalField),
      ],
      breakouts: [breakout(productIdField)],
    });
    const cardQuery: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [
        ["sum", ["field", ORDERS.TOTAL, null]],
        ["sum", ["field", ORDERS.SUBTOTAL, null]],
      ],
      breakout: [["field", ORDERS.PRODUCT_ID, null]],
    };

    it("orders by the first one", () => {
      const dynamicQuery = {
        orderBys: [orderBy({ type: "column", name: "sum" }, "desc")],
      };

      expectRuntimeClauses({
        cardQuery,
        useQueryStates: (cardId) => ({
          fromTable: useMetabaseQuery(staticQuery, dynamicQuery),
          fromCard: useMetabaseQuery(
            asCardQuery<typeof staticQuery>(cardId),
            dynamicQuery,
          ),
        }),
        check: ({ rawRows }) =>
          isSortedDescending(rawRows.map((row) => row[1]))
            ? null
            : "rows are not sorted by the first sum",
      });
    });

    it("orders by the second one, by the name the result reports for it", () => {
      const dynamicQuery = {
        orderBys: [orderBy({ type: "column", name: "sum_2" }, "desc")],
      };

      expectRuntimeClauses({
        cardQuery,
        useQueryStates: (cardId) => ({
          fromTable: useMetabaseQuery(staticQuery, dynamicQuery),
          fromCard: useMetabaseQuery(
            asCardQuery<typeof staticQuery>(cardId),
            dynamicQuery,
          ),
        }),
        check: ({ columns, rawRows }) =>
          columns[2]?.name !== "sum_2"
            ? `second sum is reported as ${columns[2]?.name}`
            : isSortedDescending(rawRows.map((row) => row[2]))
              ? null
              : "rows are not sorted by the second sum",
      });
    });
  });
});
