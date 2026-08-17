import {
  InteractiveQuestion,
  type MetabaseCard,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

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
});
