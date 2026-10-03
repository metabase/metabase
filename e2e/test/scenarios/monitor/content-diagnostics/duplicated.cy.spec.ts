const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  runContentDiagnosticsScan,
  searchFindings,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const SEARCH_TERM = "duplicated";

const NAME = "E2E duplicated question";
const NAME_VARIANT = "e2e  DUPLICATED   question";
const BOTH_NAMES = /e2e\s+duplicated\s+question/i;

const COLLECTION_NAME = "E2E duplicated collection";
const DASHBOARD_NAME = "E2E duplicated dashboard";
const DOCUMENT_NAME = "E2E duplicated document";

const CROSS_KIND_NAME = "E2E duplicated hybrid";

const QUERY = { "source-table": ORDERS_ID };
const EMPTY_DOCUMENT = { type: "doc", content: [] };

function createDuplicatePair() {
  H.createQuestion({ name: NAME, query: QUERY });
  H.createQuestion({ name: NAME_VARIANT, query: QUERY });
}

function createDuplicatesOfEveryType() {
  H.createCollection({ name: COLLECTION_NAME });
  H.createCollection({ name: COLLECTION_NAME });

  H.createDashboard({ name: DASHBOARD_NAME });
  H.createDashboard({ name: DASHBOARD_NAME });

  H.createDocument({ name: DOCUMENT_NAME, document: EMPTY_DOCUMENT });
  H.createDocument({ name: DOCUMENT_NAME, document: EMPTY_DOCUMENT });
}

describe("scenarios > monitor > content diagnostics > duplicated", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("lists both sides of a name cluster, each pointing at the other", () => {
    createDuplicatePair();
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("duplicated");
    searchFindings(SEARCH_TERM);

    cy.log(
      "both questions are reported, despite differing in case and spacing",
    );
    cy.findByTestId("duplicated-content-list")
      .findAllByText(BOTH_NAMES)
      .should("have.length", 2);

    cy.log("opening one shows the other as its duplicate");
    cy.findByTestId("duplicated-content-list").findByText(NAME).click();

    cy.findByTestId("content-diagnostics-sidebar").within(() => {
      cy.findByText("Duplicates (1)").should("be.visible");
      cy.findByRole("region", { name: "Duplicates" }).should(
        "contain.text",
        NAME_VARIANT,
      );
    });
  });

  it("clusters collections, dashboards and documents, not only questions", () => {
    createDuplicatesOfEveryType();
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("duplicated");
    searchFindings(SEARCH_TERM);

    cy.log("every type the checker covers reports both sides of its cluster");
    [COLLECTION_NAME, DASHBOARD_NAME, DOCUMENT_NAME].forEach((name) => {
      cy.findByTestId("duplicated-content-list")
        .findAllByText(name)
        .should("have.length", 2);
    });

    cy.log("and each side names the other as its duplicate");
    cy.findByTestId("duplicated-content-list")
      .findAllByText(COLLECTION_NAME)
      .first()
      .click();

    cy.findByTestId("content-diagnostics-sidebar").within(() => {
      cy.findByText("Duplicates (1)").should("be.visible");
      cy.findByRole("region", { name: "Duplicates" }).should(
        "contain.text",
        COLLECTION_NAME,
      );
    });
  });

  it("treats a question and a model sharing a name as duplicates", () => {
    H.createQuestion({ name: CROSS_KIND_NAME, query: QUERY });
    H.createQuestion({ name: CROSS_KIND_NAME, type: "model", query: QUERY });
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("duplicated");
    searchFindings(SEARCH_TERM);

    cy.log("both sub-kinds are reported, under their own type labels");
    cy.findByTestId("duplicated-content-list").within(() => {
      cy.findAllByText(CROSS_KIND_NAME).should("have.length", 2);
      cy.findByText("Question").should("be.visible");
      cy.findByText("Model").should("be.visible");
    });

    cy.log("the question counts the model as its duplicate");
    cy.findByTestId("duplicated-content-list")
      .findAllByText(CROSS_KIND_NAME)
      .first()
      .click();

    cy.findByTestId("content-diagnostics-sidebar").within(() => {
      cy.findByText("Duplicates (1)").should("be.visible");
      cy.findByRole("region", { name: "Duplicates" }).should(
        "contain.text",
        CROSS_KIND_NAME,
      );
    });
  });
});
