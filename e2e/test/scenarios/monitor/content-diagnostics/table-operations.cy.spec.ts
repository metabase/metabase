const { H } = cy;

import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

import {
  runContentDiagnosticsScan,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const SEARCH_TERM = "tableops";
const COLLECTION_NAME = "E2E tableops collection";
const PERSONAL_DASHBOARD_NAME = "E2E tableops personal dashboard";
const EXCLUDED_TERM = "zzdecoy";
const EXCLUDED_DASHBOARD_NAME = "E2E zzdecoy dashboard";

const DASHBOARD_COUNT = 26;
const dashboardName = (index: number) =>
  `E2E tableops dashboard ${String(index).padStart(2, "0")}`;

const FIRST_DASHBOARD_NAME = dashboardName(1);
const LAST_DASHBOARD_NAME = dashboardName(DASHBOARD_COUNT);

const TOTAL_FINDINGS = DASHBOARD_COUNT + 2;

const LIST = "imbalanced-content-list";

function seedEmptyContent() {
  H.createCollection({ name: COLLECTION_NAME });
  H.createDashboard({ name: EXCLUDED_DASHBOARD_NAME });
  H.createDashboard({
    name: PERSONAL_DASHBOARD_NAME,
    collection_id: ADMIN_PERSONAL_COLLECTION_ID,
  });

  Array.from({ length: DASHBOARD_COUNT }, (_, index) =>
    H.createDashboard({ name: dashboardName(index + 1) }),
  );
}

function searchFor(term: string) {
  H.main().findByLabelText("Search").clear().type(term);
  cy.wait("@findings");
}

function toggleFilter(label: string, { waitForFindings = true } = {}) {
  openFilterPicker();
  H.popover().findByLabelText(label).click();
  if (waitForFindings) {
    cy.wait("@findings");
  }
  closeFilterPicker();
}

function openFilterPicker() {
  cy.findByTestId("content-diagnostics-filter-button").click();
}

function closeFilterPicker() {
  cy.get("body").type("{esc}");
}

function sortByName() {
  cy.findByTestId(LIST).findByText("Name").click();
  cy.wait("@findings");
}

describe("scenarios > monitor > content diagnostics > table operations", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    seedEmptyContent();
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("empty");
  });

  // One pass over real findings: the backend does the searching, filtering, sorting and paging.
  // The request each control sends is covered in ImbalancedContentPage.unit.spec.tsx.
  it("searches, filters, sorts, pages and opens a finding against real findings", () => {
    cy.log("searching the decoy's term finds the decoy and nothing else");
    searchFor(EXCLUDED_TERM);
    cy.findByTestId(LIST).should("contain.text", EXCLUDED_DASHBOARD_NAME);
    cy.findByTestId(LIST).should("not.contain.text", FIRST_DASHBOARD_NAME);

    cy.log("searching the seeded term finds everything except the decoy");
    searchFor(SEARCH_TERM);
    cy.findByTestId("pagination-total").should("have.text", TOTAL_FINDINGS);
    cy.findByTestId(LIST).should("not.contain.text", EXCLUDED_DASHBOARD_NAME);

    cy.log("unchecking Dashboards leaves only the collection");
    toggleFilter("Dashboards");
    cy.findByTestId(LIST).findByText(COLLECTION_NAME).should("be.visible");
    cy.findByTestId(LIST).should("not.contain.text", FIRST_DASHBOARD_NAME);

    // No request to wait on here: putting dashboards back restores the default filter, so the original
    // query is served from cache rather than fetched again.
    cy.log("re-checking Dashboards brings them back");
    toggleFilter("Dashboards", { waitForFindings: false });
    cy.findByTestId(LIST).should("contain.text", FIRST_DASHBOARD_NAME);

    cy.log("sorting by name puts the first dashboard first");
    sortByName();
    cy.findByTestId(LIST).findByText(FIRST_DASHBOARD_NAME).should("be.visible");
    cy.findByTestId(LIST).should("not.contain.text", PERSONAL_DASHBOARD_NAME);

    cy.log("clicking the header again reverses the order");
    sortByName();
    cy.findByTestId(LIST)
      .findByText(PERSONAL_DASHBOARD_NAME)
      .should("be.visible");
    cy.findByTestId(LIST).should("not.contain.text", FIRST_DASHBOARD_NAME);

    cy.log("unchecking personal collections drops the personal dashboard");
    toggleFilter("Include items in personal collections");
    cy.findByTestId("pagination-total").should("have.text", TOTAL_FINDINGS - 1);
    cy.findByTestId(LIST).should("not.contain.text", PERSONAL_DASHBOARD_NAME);
    cy.findByTestId(LIST).findByText(LAST_DASHBOARD_NAME).should("be.visible");

    cy.log("the next page holds the rest of the reversed order");
    cy.findByTestId("next-page-btn").click();
    cy.wait("@findings");
    cy.findByTestId(LIST).findByText(FIRST_DASHBOARD_NAME).should("be.visible");
    cy.findByTestId(LIST).should("not.contain.text", LAST_DASHBOARD_NAME);

    cy.log("clicking a finding opens its details");
    cy.findByTestId(LIST).findByText(COLLECTION_NAME).click();
    cy.findByTestId("content-diagnostics-sidebar").within(() => {
      cy.findByText(COLLECTION_NAME).should("be.visible");
      cy.findByText("Content count").should("be.visible");
      cy.findByText("0 items").should("be.visible");
    });
  });
});

describe("scenarios > monitor > content diagnostics > remembered filters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  // The filters are saved through the real user-key-value endpoint and read back after a reload.
  // URL filters winning over remembered ones is covered in StaleContentPage.unit.spec.tsx.
  it("brings back the filters last used on the tab", () => {
    visitContentDiagnosticsTab("stale");
    toggleFilter("Dashboards");
    cy.location("search").should("contain", "entity-types");

    cy.log("leave the tab and come back to it with a bare url");
    visitContentDiagnosticsTab("slow");
    visitContentDiagnosticsTab("stale");

    cy.log("the url is rewritten with what was last used here");
    cy.location("search").should("contain", "entity-types");

    openFilterPicker();
    H.popover().findByLabelText("Dashboards").should("not.be.checked");
    H.popover().findByLabelText("Questions").should("be.checked");
  });
});
