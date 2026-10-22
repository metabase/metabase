import {
  InteractiveQuestion,
  type MetabaseCard,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";
import { useState } from "react";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { H } = cy;

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// What a data app actually passes: a `card` object built from a query (e.g. the
// output of `createMetabaseQuery` / `useMetabaseQueryObject`) plus the chosen
// `visualization` and its `visualizationSettings`. The serialized-string form is
// an edge case covered by the unit tests; here we verify the data-app path
// renders the chosen chart end-to-end.
const card: MetabaseCard = {
  query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
      breakout: [["field", ORDERS.PRODUCT_ID, null]],
      limit: 2,
    },
  },
  visualization: "bar",
  visualizationSettings: {
    "graph.y_axis.title_text": "Max quantity",
  },
};

describe("scenarios > embedding-sdk > sdk-question card prop", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("InteractiveQuestion should render the chosen visualization from the `card` prop", () => {
    mountSdkContent(<InteractiveQuestion card={card} />);

    cy.wait("@dataset").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
    });

    getSdkRoot().within(() => {
      cy.log("renders the chart, honoring the chosen `bar` visualization");
      cy.findByTestId("visualization-root").should("be.visible");
      cy.findByTestId("table-root").should("not.exist");
    });
  });

  it("StaticQuestion should render the chosen visualization from the `card` prop", () => {
    mountSdkContent(<StaticQuestion card={card} />);

    cy.wait("@dataset").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
    });

    getSdkRoot().within(() => {
      cy.log("renders the chart, honoring the chosen `bar` visualization");
      cy.findByTestId("visualization-root").should("be.visible");
      cy.findByTestId("table-root").should("not.exist");
    });
  });

  describe("card with a not-yet-resolved query (EMB-2390)", () => {
    // Data apps mount the question as soon as `useMetabaseQueryObject` returns,
    // whose `query` is null until it resolves. The SDK must keep showing its
    // loader for that window and never fall through to the "run your code"
    // empty state that belongs to a blank question.
    const EMPTY_STATE_SELECTOR = 'img[alt="Code prompt icon"]';
    const VISUALIZATION_SELECTOR = '[data-testid="visualization-root"]';
    const PENDING_QUERY_HOLD_MS = 1500;

    function assertEmptyStateNeverShownWhilePending() {
      cy.window().then((win) => {
        return new Cypress.Promise((resolve, reject) => {
          const startedAt = Date.now();

          const checkInterval = setInterval(() => {
            if (win.document.querySelector(EMPTY_STATE_SELECTOR)) {
              clearInterval(checkInterval);
              reject(
                new Error(
                  "the empty results state must not show while `card.query` is null",
                ),
              );
            } else if (Date.now() - startedAt >= PENDING_QUERY_HOLD_MS) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 20);
        });
      });
    }

    function assertEmptyStateNeverShownWhileResolving() {
      H.assertElementNeverExists({
        shouldNotExistSelector: EMPTY_STATE_SELECTOR,
        successSelector: VISUALIZATION_SELECTOR,
        rejectionMessage:
          "the empty results state must not flash between the query resolving and the results rendering",
        pollInterval: 20,
        timeout: 15000,
      });
    }

    function DeferredInteractiveQuestion() {
      const [query, setQuery] = useState<MetabaseCard["query"]>(null);

      return (
        <div>
          <InteractiveQuestion card={{ ...card, query }} />
          <button onClick={() => setQuery(card.query)}>Resolve query</button>
        </div>
      );
    }

    function DeferredStaticQuestion() {
      const [query, setQuery] = useState<MetabaseCard["query"]>(null);

      return (
        <div>
          <StaticQuestion card={{ ...card, query }} />
          <button onClick={() => setQuery(card.query)}>Resolve query</button>
        </div>
      );
    }

    it("InteractiveQuestion should show a loader instead of the empty results state until `card.query` resolves", () => {
      mountSdkContent(<DeferredInteractiveQuestion />);

      getSdkRoot().within(() => {
        assertEmptyStateNeverShownWhilePending();
        cy.findByTestId("loading-indicator").should("be.visible");
      });

      cy.findByRole("button", { name: "Resolve query" }).click();
      assertEmptyStateNeverShownWhileResolving();

      getSdkRoot().within(() => {
        cy.findByTestId("visualization-root").should("be.visible");
      });
    });

    it("StaticQuestion should show a loader instead of the empty results state until `card.query` resolves", () => {
      mountSdkContent(<DeferredStaticQuestion />);

      getSdkRoot().within(() => {
        assertEmptyStateNeverShownWhilePending();
        cy.findByTestId("loading-indicator").should("be.visible");
      });

      cy.findByRole("button", { name: "Resolve query" }).click();
      assertEmptyStateNeverShownWhileResolving();

      getSdkRoot().within(() => {
        cy.findByTestId("visualization-root").should("be.visible");
      });
    });
  });
});
