const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  runContentDiagnosticsScan,
  searchFindings,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const SEARCH_TERM = "rescanning";
const COLLECTION_NAME = "E2E rescanning collection";
const DASHBOARD_NAME = "E2E rescanning dashboard";
const CHILD_QUESTION_NAME = "E2E child question";

describe("scenarios > monitor > content diagnostics > rescanning", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("drops a finding once the problem is fixed or the entity is gone", () => {
    H.createCollection({ name: COLLECTION_NAME }).then(({ body: collection }) =>
      cy.wrap(collection.id).as("collectionId"),
    );
    H.createDashboard({ name: DASHBOARD_NAME }).then(({ body: dashboard }) =>
      cy.wrap(dashboard.id).as("dashboardId"),
    );
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.log("both start out empty, and are reported as such");
    cy.findByTestId("imbalanced-content-list").within(() => {
      cy.findByText(COLLECTION_NAME).should("be.visible");
      cy.findByText(DASHBOARD_NAME).should("be.visible");
    });

    cy.get("@collectionId").then((collectionId) => {
      H.createQuestion({
        name: CHILD_QUESTION_NAME,
        collection_id: Number(collectionId),
        query: { "source-table": ORDERS_ID },
      });
    });
    cy.get("@dashboardId").then((dashboardId) => {
      cy.request("DELETE", `/api/dashboard/${dashboardId}`);
    });
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.log("the collection is no longer empty, so its finding is gone");
    cy.findByTestId("imbalanced-content-list").should(
      "not.contain.text",
      COLLECTION_NAME,
    );

    cy.log("and the deleted dashboard takes its finding with it");
    cy.findByTestId("imbalanced-content-list").should(
      "not.contain.text",
      DASHBOARD_NAME,
    );
  });
});
