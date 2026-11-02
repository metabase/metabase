const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  markStale,
  runContentDiagnosticsScan,
  searchFindings,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const SEARCH_TERM = "staleness";
const QUESTION_NAME = "E2E staleness backdated question";
const DASHBOARD_NAME = "E2E staleness backdated dashboard";
const DOCUMENT_NAME = "E2E staleness backdated document";
const FRESH_NAME = "E2E staleness fresh question";

const LAST_USED_ON = "2020-06-15";
const LAST_USED_DISPLAY = "June 15, 2020";

const BACKDATED = [
  { name: QUESTION_NAME, activityLabel: "Last used" },
  { name: DASHBOARD_NAME, activityLabel: "Last viewed" },
  { name: DOCUMENT_NAME, activityLabel: "Last viewed" },
];

function createContent() {
  H.createQuestion({ name: FRESH_NAME, query: { "source-table": ORDERS_ID } });

  H.createQuestion({
    name: QUESTION_NAME,
    query: { "source-table": ORDERS_ID },
  }).then(({ body: card }) => markStale("card", card.id, LAST_USED_ON));

  H.createDashboard({ name: DASHBOARD_NAME }).then(({ body: dashboard }) =>
    markStale("dashboard", dashboard.id, LAST_USED_ON),
  );

  H.createDocument({
    name: DOCUMENT_NAME,
    document: { type: "doc", content: [] },
  }).then(({ body: document }) =>
    markStale("document", document.id, LAST_USED_ON),
  );
}

describe("scenarios > monitor > content diagnostics > stale", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("reports backdated content of every type, and leaves recently used content out", () => {
    createContent();
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("stale");
    searchFindings(SEARCH_TERM);

    cy.log("each type is reported, carrying the date it was last active");
    cy.findByTestId("stale-content-list").within(() => {
      BACKDATED.forEach(({ name }) => {
        cy.findByText(name).should("be.visible");
      });
      cy.findAllByText(LAST_USED_DISPLAY).should(
        "have.length",
        BACKDATED.length,
      );
    });

    cy.log("the question that has not gone stale is left out");
    cy.findByTestId("stale-content-list").should(
      "not.contain.text",
      FRESH_NAME,
    );

    cy.log("the sidebar names each type's own kind of activity");
    BACKDATED.forEach(({ name, activityLabel }) => {
      cy.findByTestId("stale-content-list").findByText(name).click();

      cy.findByTestId("content-diagnostics-sidebar").within(() => {
        cy.findByText(activityLabel).should("be.visible");
        cy.findByText(LAST_USED_DISPLAY).should("be.visible");
      });
    });
  });
});
