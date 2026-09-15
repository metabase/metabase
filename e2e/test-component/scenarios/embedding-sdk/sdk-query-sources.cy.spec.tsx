import { MetabaseProvider } from "@metabase/embedding-sdk-react";
import {
  type DefinedQuery,
  type MetabaseQueryOptions,
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

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const tableSource = { type: "table" as const, id: ORDERS_ID };

/** The same dimension addressed on a table source and on a card's result columns. */
const totalField = {
  type: "column" as const,
  fieldId: ORDERS.TOTAL,
  tableId: ORDERS_ID,
  name: "TOTAL",
  jsType: "number" as const,
};
const totalColumn = {
  type: "column" as const,
  name: "TOTAL",
  jsType: "number" as const,
};
const productField = {
  type: "column" as const,
  fieldId: ORDERS.PRODUCT_ID,
  tableId: ORDERS_ID,
  name: "PRODUCT_ID",
  jsType: "number" as const,
};
const productColumn = {
  type: "column" as const,
  name: "PRODUCT_ID",
  jsType: "number" as const,
};

const describeResult = (
  data: { columns: { name: string }[]; rawRows: unknown[][] } | null,
) =>
  data &&
  `[${data.columns.map((column) => column.name).join(",")}] ${JSON.stringify(data.rawRows)}`;

type SourceQuery = MetabaseQueryOptions<undefined> & DefinedQuery;

const asCardQuery = (query: {
  source: { type: "card"; id: number };
  [clause: string]: unknown;
}) =>
  // The public query type admits only a table source until saved-question
  // sources ship, while the runtime this test exercises also accepts a card.
  // The cast keeps the card variant on the package API instead of reaching
  // the hook underneath.
  query as unknown as SourceQuery;

/**
 * Runs the same clauses against a table source and against a card of that table,
 * and reports whether they agree — so an assertion never has to encode
 * sample-database numbers.
 */
function QueryComparison({
  tableQuery,
  cardQuery,
}: {
  tableQuery: SourceQuery;
  cardQuery: SourceQuery;
}) {
  const fromTable = useMetabaseQuery(tableQuery);
  const fromCard = useMetabaseQuery(cardQuery);

  const failure = fromTable.error ?? fromCard.error;
  const table = describeResult(fromTable.data);
  const card = describeResult(fromCard.data);

  const status = failure
    ? `error: ${String(failure)}`
    : table === null || card === null
      ? "loading"
      : table === card
        ? "match"
        : `mismatch: table=${table} card=${card}`;

  return (
    <>
      <div data-testid="comparison">{status}</div>
      <div data-testid="first-aggregate">
        {String(fromCard.data?.rawRows?.[0]?.at(-1) ?? "")}
      </div>
    </>
  );
}

/**
 * A table source and a saved-question source are interchangeable to the query
 * DSL. This lives outside a data app on purpose: there a query runs the card it
 * was published as, so an un-published table source is refused and the two
 * cannot be compared side by side.
 */
describe("scenarios > embedding-sdk > query sources", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "Orders, for source comparison",
      query: { "source-table": ORDERS_ID },
    }).then(({ body: card }) => {
      cy.wrap({ type: "card" as const, id: card.id }).as("cardSource");
    });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  const compare = (
    build: (source: { type: "card"; id: number }) => {
      tableQuery: SourceQuery;
      cardQuery: SourceQuery;
    },
  ) =>
    cy.get<{ type: "card"; id: number }>("@cardSource").then((cardSource) => {
      const { tableQuery, cardQuery } = build(cardSource);

      mountSdk(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <QueryComparison tableQuery={tableQuery} cardQuery={cardQuery} />
        </MetabaseProvider>,
      );

      cy.findByTestId("comparison", { timeout: 30000 }).should(
        "have.text",
        "match",
      );
      // Every comparison ends in an aggregation, and breakout columns come first, so
      // the first row's last cell is an aggregate. An empty result renders "" and a
      // zero count renders 0 — both vacuous matches, and both fail here.
      cy.findByTestId("first-aggregate").should(($el) =>
        expect(Number($el.text())).to.be.greaterThan(0),
      );
    });

  it("returns the same rows from a table and from a card of that table", () => {
    compare((source) => ({
      tableQuery: defineQuery({
        source: tableSource,
        aggregations: [aggregations.count()],
      }),
      cardQuery: asCardQuery({ source, aggregations: [aggregations.count()] }),
    }));
  });

  it("applies filters the same way on either source", () => {
    compare((source) => ({
      tableQuery: defineQuery({
        source: tableSource,
        filters: [filter(totalField, ">", 50)],
        aggregations: [aggregations.count()],
      }),
      cardQuery: asCardQuery({
        source,
        filters: [filter(totalColumn, ">", 50)],
        aggregations: [aggregations.count()],
      }),
    }));
  });

  it("applies aggregations the same way on either source", () => {
    compare((source) => ({
      tableQuery: defineQuery({
        source: tableSource,
        aggregations: [aggregations.count(), aggregations.sum(totalField)],
      }),
      cardQuery: asCardQuery({
        source,
        aggregations: [aggregations.count(), aggregations.sum(totalColumn)],
      }),
    }));
  });

  // The combinators the query builder exposes, on both source kinds at once.
  it("applies breakouts and orderBys the same way on either source", () => {
    compare((source) => ({
      tableQuery: defineQuery({
        source: tableSource,
        filters: [filter(totalField, ">", 50)],
        aggregations: [aggregations.count()],
        breakouts: [breakout(productField)],
        orderBys: [orderBy(productField, "asc")],
      }),
      cardQuery: asCardQuery({
        source,
        filters: [filter(totalColumn, ">", 50)],
        aggregations: [aggregations.count()],
        breakouts: [breakout(productColumn)],
        orderBys: [orderBy(productColumn, "asc")],
      }),
    }));
  });
});
