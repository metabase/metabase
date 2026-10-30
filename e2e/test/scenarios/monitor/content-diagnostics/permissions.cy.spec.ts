const { H } = cy;

import {
  ALL_USERS_GROUP_ID,
  COLLECTION_GROUP_ID,
  DATA_GROUP_ID,
  NORMAL_USER_ID,
} from "e2e/support/cypress_sample_instance_data";

import {
  runContentDiagnosticsScan,
  searchFindings,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const SEARCH_TERM = "permissioned";
const READABLE_DASHBOARD_NAME = "E2E permissioned readable dashboard";
const HIDDEN_DASHBOARD_NAME = "E2E permissioned hidden dashboard";
const HIDDEN_COLLECTION_NAME = "E2E permissioned hidden collection";

const CONTENT_DIAGNOSTICS_PATH = "/monitor/content-diagnostics/stale";
const UPSELL_TITLE = "Find and clean up stale content without hunting it down";

describe("scenarios > monitor > content diagnostics > permissions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shows the upsell and asks for no findings without the token", () => {
    cy.intercept("GET", "/api/ee/content-diagnostics/**").as("findings");

    cy.visit(CONTENT_DIAGNOSTICS_PATH);
    H.main().findByText(UPSELL_TITLE).should("be.visible");

    cy.get("@findings.all").should("have.length", 0);
  });

  describe("with the token", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
    });

    it("shows a data analyst only the findings they can read", () => {
      H.createDashboard({ name: READABLE_DASHBOARD_NAME });
      H.createCollection({ name: HIDDEN_COLLECTION_NAME }).then(
        ({ body: collection }) => {
          H.createDashboard({
            name: HIDDEN_DASHBOARD_NAME,
            collection_id: collection.id,
          });
          cy.updateCollectionGraph({
            [ALL_USERS_GROUP_ID]: { [collection.id]: "none" as const },
            [COLLECTION_GROUP_ID]: { [collection.id]: "none" as const },
            [DATA_GROUP_ID]: { [collection.id]: "none" as const },
          });
        },
      );
      runContentDiagnosticsScan();

      H.setUserAsAnalyst(NORMAL_USER_ID);
      cy.signInAsNormalUser();

      visitContentDiagnosticsTab("empty");
      searchFindings(SEARCH_TERM);

      cy.findByTestId("imbalanced-content-list")
        .findByText(READABLE_DASHBOARD_NAME)
        .should("be.visible");
      cy.findByTestId("imbalanced-content-list").should(
        "not.contain.text",
        HIDDEN_DASHBOARD_NAME,
      );
    });

    it("lets in a monitoring user who is not an analyst", () => {
      H.updateAdvancedPermissionsGraph({
        [ALL_USERS_GROUP_ID]: { monitoring: "yes" },
      });
      cy.signInAsNormalUser();

      cy.visit("/monitor");
      cy.findByRole("link", { name: /Content diagnostics/ }).should("exist");

      visitContentDiagnosticsTab("stale");
      cy.location("pathname").should("eq", CONTENT_DIAGNOSTICS_PATH);
    });
  });
});
