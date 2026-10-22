const { H } = cy;

import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

import {
  runContentDiagnosticsScan,
  searchFindings,
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

  it("narrows the table by search, entity type and personal collections", () => {
    cy.log("searching the decoy's term finds the decoy and nothing else");
    searchFor(EXCLUDED_TERM);
    cy.findByTestId(LIST).should("contain.text", EXCLUDED_DASHBOARD_NAME);
    cy.findByTestId(LIST).should("not.contain.text", FIRST_DASHBOARD_NAME);

    cy.log("searching the seeded term finds everything except the decoy");
    searchFor(SEARCH_TERM);
    cy.findByTestId("pagination-total").should("have.text", TOTAL_FINDINGS);
    cy.findByTestId(LIST).should("not.contain.text", EXCLUDED_DASHBOARD_NAME);

    cy.log("unchecking Dashboards leaves only the collection");
    openFilterPicker();
    H.popover().findByLabelText("Dashboards").click();
    cy.wait("@findings");
    closeFilterPicker();
    cy.findByTestId(LIST).findByText(COLLECTION_NAME).should("be.visible");
    cy.findByTestId(LIST).should("not.contain.text", FIRST_DASHBOARD_NAME);

    // No request to wait on here: putting dashboards back restores the default filter, so the original
    // query is served from cache rather than fetched again.
    cy.log("re-checking Dashboards brings them back");
    openFilterPicker();
    H.popover().findByLabelText("Dashboards").click();
    closeFilterPicker();
    cy.findByTestId(LIST).should("contain.text", FIRST_DASHBOARD_NAME);

    cy.log("unchecking personal collections drops the personal dashboard");
    openFilterPicker();
    H.popover()
      .findByLabelText("Include items in personal collections")
      .click();
    cy.wait("@findings");
    closeFilterPicker();

    cy.findByTestId("pagination-total").should("have.text", TOTAL_FINDINGS - 1);
  });

  it("sorts the table by the column that was clicked", () => {
    searchFindings(SEARCH_TERM);
    sortByName();
    cy.findByTestId(LIST).findByText(FIRST_DASHBOARD_NAME).should("be.visible");
    cy.findByTestId(LIST).should("not.contain.text", PERSONAL_DASHBOARD_NAME);

    cy.log("clicking the header again reverses the order");
    sortByName();
    cy.findByTestId(LIST)
      .findByText(PERSONAL_DASHBOARD_NAME)
      .should("be.visible");
    cy.findByTestId(LIST).should("not.contain.text", FIRST_DASHBOARD_NAME);
  });

  it("loads the next page of results", () => {
    searchFindings(SEARCH_TERM);
    sortByName();
    cy.findByTestId(LIST).findByText(FIRST_DASHBOARD_NAME).should("be.visible");
    cy.findByTestId(LIST).should("not.contain.text", LAST_DASHBOARD_NAME);

    cy.findByTestId("next-page-btn").click();
    cy.wait("@findings");

    cy.findByTestId(LIST).findByText(LAST_DASHBOARD_NAME).should("be.visible");
    cy.findByTestId(LIST).should("not.contain.text", FIRST_DASHBOARD_NAME);
  });

  it("opens a sidebar of details for the finding that was clicked", () => {
    searchFindings(SEARCH_TERM);

    cy.findByTestId("pagination-total").should("have.text", TOTAL_FINDINGS);
    cy.findByTestId(LIST).findByText(COLLECTION_NAME).click();

    cy.findByTestId("content-diagnostics-sidebar").within(() => {
      cy.findByText(COLLECTION_NAME).should("be.visible");
      cy.findByText("Content count").should("be.visible");
      cy.findByText("0 items").should("be.visible");
    });
  });

  it("starts a neighbouring tab clean, with no search, filters or sidebar", () => {
    searchFindings(SEARCH_TERM);
    openFilterPicker();
    H.popover().findByLabelText("Dashboards").click();
    cy.wait("@findings");
    closeFilterPicker();

    cy.findByTestId(LIST).should("not.contain.text", FIRST_DASHBOARD_NAME);
    cy.findByTestId(LIST).findByText(COLLECTION_NAME).click();
    cy.findByTestId("content-diagnostics-sidebar").should("be.visible");

    cy.log("switching tabs clears the search, the filters and the sidebar");
    cy.findByRole("link", { name: "Sparse" }).click();
    cy.wait("@findings");

    cy.findByTestId("content-diagnostics-sidebar").should("not.exist");
    H.main().findByLabelText("Search").should("have.value", "");
    cy.findByTestId("content-diagnostics-filter-button").should("be.visible");
  });
});
