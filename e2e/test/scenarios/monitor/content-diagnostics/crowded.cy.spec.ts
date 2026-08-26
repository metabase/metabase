const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import {
  documentEmbedding,
  runContentDiagnosticsScan,
  searchFindings,
  setThreshold,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const SEARCH_TERM = "crowding";
const COLLECTION_NAME = "E2E crowding collection";
const TABBED_DASHBOARD_NAME = "E2E crowding tabbed dashboard";
const PACKED_DASHBOARD_NAME = "E2E crowding packed dashboard";
const DOCUMENT_NAME = "E2E crowding document";

const CHILD_QUESTION_NAMES = [
  "E2E child question A",
  "E2E child question B",
  "E2E child question C",
];

const COLLECTION_ITEM_LIMIT = 2;
const DASHBOARD_TAB_LIMIT = 1;
const DASHCARDS_PER_TAB_LIMIT = 1;
const DOCUMENT_CARD_LIMIT = 1;

const TABS = [
  { id: 1, name: "First tab" },
  { id: 2, name: "Second tab" },
];

const CROWDED = [
  { name: COLLECTION_NAME, count: "3 items" },
  { name: PACKED_DASHBOARD_NAME, count: "2 dashcards" },
  { name: TABBED_DASHBOARD_NAME, count: "2 tabs" },
  { name: DOCUMENT_NAME, count: "2 cards" },
];

function lowerThresholds() {
  setThreshold(
    "content-diagnostics-crowded-collection-threshold-items",
    COLLECTION_ITEM_LIMIT,
  );
  setThreshold(
    "content-diagnostics-crowded-dashboard-threshold-tabs",
    DASHBOARD_TAB_LIMIT,
  );
  setThreshold(
    "content-diagnostics-crowded-dashboard-threshold-dashcards-per-tab",
    DASHCARDS_PER_TAB_LIMIT,
  );
  setThreshold(
    "content-diagnostics-crowded-document-threshold-cards",
    DOCUMENT_CARD_LIMIT,
  );
}

function createCrowdedContent() {
  H.createCollection({ name: COLLECTION_NAME }).then(({ body: collection }) => {
    CHILD_QUESTION_NAMES.forEach((name) => {
      H.createQuestion({
        name,
        collection_id: collection.id,
        query: { "source-table": ORDERS_ID },
      });
    });
  });

  H.createDashboard({ name: PACKED_DASHBOARD_NAME }).then(
    ({ body: dashboard }) => {
      H.addQuestionToDashboard({
        dashboardId: dashboard.id,
        cardId: ORDERS_QUESTION_ID,
      });
      H.addQuestionToDashboard({
        dashboardId: dashboard.id,
        cardId: ORDERS_QUESTION_ID,
      });
    },
  );

  H.createDashboardWithTabs({ name: TABBED_DASHBOARD_NAME, tabs: TABS });

  H.createDocument({
    name: DOCUMENT_NAME,
    document: documentEmbedding([ORDERS_QUESTION_ID, ORDERS_QUESTION_ID]),
  });
}

describe("scenarios > monitor > content diagnostics > crowded", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("reports every type that holds too much, on the axis it crossed", () => {
    lowerThresholds();
    createCrowdedContent();
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("crowded");
    searchFindings(SEARCH_TERM);

    cy.log("each subject is reported, having crossed a bound of its own");
    cy.findByTestId("imbalanced-content-list").within(() => {
      CROWDED.forEach(({ name }) => {
        cy.findByText(name).should("be.visible");
      });
    });

    cy.log("the sidebar counts each one in the unit of the bound it crossed");
    CROWDED.forEach(({ name, count }) => {
      cy.findByTestId("imbalanced-content-list").findByText(name).click();

      cy.findByTestId("content-diagnostics-sidebar").within(() => {
        cy.findByText("Content count").should("be.visible");
        cy.findByText(count).should("be.visible");
      });
    });
  });
});
