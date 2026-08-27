const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

import {
  documentEmbedding,
  embeddedCardIds,
  runContentDiagnosticsScan,
  searchFindings,
  setThreshold,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const SEARCH_TERM = "slowness";
const CARD_NAME = "E2E slowness question";
const EMBEDDED_CARD_NAME = "E2E slowness embedded question";
const DASHBOARD_NAME = "E2E slowness dashboard";
const DOCUMENT_NAME = "E2E slowness document";

const SLEEP_SECONDS = 2;
const THRESHOLD_SECONDS = 1;
const SLOW_QUERY = `SELECT pg_sleep(${SLEEP_SECONDS})`;

const SECONDS_DURATION = /^\d+\.\ds$/;

// EMBEDDED_CARD_NAME is the document's internal copy of its card. Currently internal copies
// are reported as slow findings, along with the document they embed. This should change
// once GDGT-3147 lands, but for now we assert existing behavior.
const SLOW = [CARD_NAME, DASHBOARD_NAME, EMBEDDED_CARD_NAME, DOCUMENT_NAME];

function createSlowQuestion(name: string) {
  return H.createNativeQuestion({
    name,
    database: WRITABLE_DB_ID,
    native: { query: SLOW_QUERY },
  });
}

function createSlowContent() {
  createSlowQuestion(CARD_NAME).then(({ body: card }) => {
    cy.request("POST", `/api/card/${card.id}/query`);

    H.createDashboard({ name: DASHBOARD_NAME }).then(({ body: dashboard }) => {
      H.addQuestionToDashboard({ dashboardId: dashboard.id, cardId: card.id });
    });
  });

  createSlowQuestion(EMBEDDED_CARD_NAME).then(({ body: card }) => {
    H.createDocument({
      name: DOCUMENT_NAME,
      document: documentEmbedding([card.id]),
    }).then(({ body: document }) => {
      embeddedCardIds(document.document).forEach((id) => {
        cy.request("POST", `/api/card/${id}/query`);
      });
    });
  });
}

describe(
  "scenarios > monitor > content diagnostics > slow",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
    });

    it("reports slow cards, and the dashboard and document that embed them", () => {
      setThreshold(
        "content-diagnostics-slow-card-threshold-seconds",
        THRESHOLD_SECONDS,
      );
      createSlowContent();
      runContentDiagnosticsScan();

      visitContentDiagnosticsTab("slow");
      searchFindings(SEARCH_TERM);

      cy.log("the measured cards are reported, and so are both roll-ups");
      cy.findByTestId("slow-content-list").within(() => {
        SLOW.forEach((name) => {
          cy.findByText(name).should("be.visible");
        });
      });

      cy.log("each one reports a duration on the scale of the query itself");
      SLOW.forEach((name) => {
        cy.findByTestId("slow-content-list").findByText(name).click();

        cy.findByTestId("content-diagnostics-sidebar").within(() => {
          cy.findByText("Duration").should("be.visible");
          cy.findByText(SECONDS_DURATION).should("be.visible");
        });
      });
    });
  },
);
