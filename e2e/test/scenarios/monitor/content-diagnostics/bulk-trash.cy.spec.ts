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

const SEARCH_TERM = "trashing";
const FIRST_DASHBOARD_NAME = "E2E trashing first dashboard";
const SECOND_DASHBOARD_NAME = "E2E trashing second dashboard";

const WRITABLE_DASHBOARD_NAME = "E2E trashing writable dashboard";
const READABLE_DASHBOARD_NAME = "E2E trashing readable dashboard";
const READABLE_COLLECTION_NAME = "E2E trashing readable collection";

const LIST = "imbalanced-content-list";

function findingRow(name: string) {
  return cy.findByTestId(LIST).contains('[role="row"]', name);
}

describe("scenarios > monitor > content diagnostics > bulk trash", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("moves the selected findings to the trash and drops them from the list", () => {
    H.createDashboard({ name: FIRST_DASHBOARD_NAME });
    H.createDashboard({ name: SECOND_DASHBOARD_NAME });
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    findingRow(FIRST_DASHBOARD_NAME).findByRole("checkbox").click();
    findingRow(SECOND_DASHBOARD_NAME).findByRole("checkbox").click();

    cy.findByTestId("toast-card").within(() => {
      cy.findByText("2 items selected").should("be.visible");
      cy.findByRole("button", { name: "Move to trash" }).click();
    });

    H.modal().within(() => {
      cy.findByText("Move 2 items to trash?").should("be.visible");
      cy.findByRole("button", { name: "Move to trash" }).click();
    });

    H.undoToast().findByText("Moved 2 items to the trash").should("be.visible");

    cy.log(
      "trashing the entities invalidates their findings, so the list empties",
    );
    cy.findByTestId(LIST).should("not.contain.text", FIRST_DASHBOARD_NAME);
    cy.findByTestId(LIST).should("not.contain.text", SECOND_DASHBOARD_NAME);
  });

  it("lets an analyst select only the findings they can trash", () => {
    H.createDashboard({ name: WRITABLE_DASHBOARD_NAME });
    H.createCollection({ name: READABLE_COLLECTION_NAME }).then(
      ({ body: collection }) => {
        H.createDashboard({
          name: READABLE_DASHBOARD_NAME,
          collection_id: collection.id,
        });
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP_ID]: { [collection.id]: "read" as const },
          [COLLECTION_GROUP_ID]: { [collection.id]: "read" as const },
          [DATA_GROUP_ID]: { [collection.id]: "read" as const },
        });
      },
    );
    runContentDiagnosticsScan();

    H.setUserAsAnalyst(NORMAL_USER_ID);
    cy.signInAsNormalUser();

    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    findingRow(WRITABLE_DASHBOARD_NAME)
      .findByRole("checkbox")
      .should("be.enabled");
    findingRow(READABLE_DASHBOARD_NAME)
      .findByRole("checkbox")
      .should("be.disabled");
  });
});
