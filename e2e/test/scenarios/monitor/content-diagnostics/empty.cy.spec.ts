const { H } = cy;

import {
  runContentDiagnosticsScan,
  searchFindings,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const SEARCH_TERM = "emptiness";
const COLLECTION_NAME = "E2E emptiness collection";
const DASHBOARD_NAME = "E2E emptiness dashboard";
const DOCUMENT_NAME = "E2E emptiness document";
const QUESTION_NAME = "E2E emptiness question";

const EMPTY = [
  { name: COLLECTION_NAME, count: "0 items" },
  { name: DASHBOARD_NAME, count: "0 dashcards" },
  { name: DOCUMENT_NAME, count: "0 cards" },
  { name: QUESTION_NAME, count: "0 rows" },
];

function createEmptyContent() {
  H.createCollection({ name: COLLECTION_NAME });
  H.createDashboard({ name: DASHBOARD_NAME });
  H.createDocument({
    name: DOCUMENT_NAME,
    document: { type: "doc", content: [] },
  });

  H.createNativeQuestion({
    name: QUESTION_NAME,
    native: { query: "SELECT * FROM ORDERS WHERE ID < 0" },
  }).then(({ body: card }) => {
    cy.request("POST", `/api/card/${card.id}/query`);
  });
}

describe("scenarios > monitor > content diagnostics > empty", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("reports every type of content that has nothing in it", () => {
    createEmptyContent();
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.log("all four entity types are reported by the one checker");
    cy.findByTestId("imbalanced-content-list").within(() => {
      EMPTY.forEach(({ name }) => {
        cy.findByText(name).should("be.visible");
      });
    });

    cy.log("the sidebar counts each type in the unit that suits it");
    EMPTY.forEach(({ name, count }) => {
      cy.findByTestId("imbalanced-content-list").findByText(name).click();

      cy.findByTestId("content-diagnostics-sidebar").within(() => {
        cy.findByText("Content count").should("be.visible");
        cy.findByText(count).should("be.visible");
      });
    });
  });
});
