const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import {
  runContentDiagnosticsScan,
  searchFindings,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const SEARCH_TERM = "sparsity";
const SPARSE_COLLECTION_NAME = "E2E sparsity thin collection";
const SPARSE_DASHBOARD_NAME = "E2E sparsity thin dashboard";
const EMPTY_COLLECTION_NAME = "E2E sparsity bare collection";

const CHILD_QUESTION_NAMES = ["E2E child question A", "E2E child question B"];

const SPARSE = [
  { name: SPARSE_COLLECTION_NAME, count: "2 items" },
  { name: SPARSE_DASHBOARD_NAME, count: "1 dashcard" },
];

function createContent() {
  H.createCollection({ name: EMPTY_COLLECTION_NAME });

  H.createCollection({ name: SPARSE_COLLECTION_NAME }).then(
    ({ body: collection }) => {
      CHILD_QUESTION_NAMES.forEach((name) => {
        H.createQuestion({
          name,
          collection_id: collection.id,
          query: { "source-table": ORDERS_ID },
        });
      });
    },
  );

  H.createDashboard({ name: SPARSE_DASHBOARD_NAME }).then(
    ({ body: dashboard }) => {
      H.addQuestionToDashboard({
        dashboardId: dashboard.id,
        cardId: ORDERS_QUESTION_ID,
      });
    },
  );
}

describe("scenarios > monitor > content diagnostics > sparse", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("reports thinly filled content, leaving bare content to the empty tab", () => {
    createContent();
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("sparse");
    searchFindings(SEARCH_TERM);

    cy.log("both types holding a little content are reported as sparse");
    cy.findByTestId("imbalanced-content-list").within(() => {
      SPARSE.forEach(({ name }) => {
        cy.findByText(name).should("be.visible");
      });
    });

    cy.log(
      "sparseness floors at one item, so the bare collection is not sparse",
    );
    cy.findByTestId("imbalanced-content-list").should(
      "not.contain.text",
      EMPTY_COLLECTION_NAME,
    );

    cy.log("the sidebar counts each type in the unit that suits it");
    SPARSE.forEach(({ name, count }) => {
      cy.findByTestId("imbalanced-content-list").findByText(name).click();

      cy.findByTestId("content-diagnostics-sidebar").within(() => {
        cy.findByText("Content count").should("be.visible");
        cy.findByText(count).should("be.visible");
      });
    });

    cy.log("the bare collection is reported by the empty tab instead");
    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.findByTestId("imbalanced-content-list")
      .findByText(EMPTY_COLLECTION_NAME)
      .should("be.visible");
    cy.findByTestId("imbalanced-content-list").should(
      "not.contain.text",
      SPARSE_COLLECTION_NAME,
    );
  });
});
