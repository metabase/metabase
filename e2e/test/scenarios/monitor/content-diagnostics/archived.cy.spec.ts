const { H } = cy;

import {
  runContentDiagnosticsScan,
  searchFindings,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const SEARCH_TERM = "archiving";

const LIVE_COLLECTION_NAME = "E2E archiving live collection";
const LIVE_DASHBOARD_NAME = "E2E archiving live dashboard";
const LIVE_DOCUMENT_NAME = "E2E archiving live document";

const TRASHED_COLLECTION_NAME = "E2E archiving trashed collection";
const TRASHED_DASHBOARD_NAME = "E2E archiving trashed dashboard";
const TRASHED_DOCUMENT_NAME = "E2E archiving trashed document";

const LIVE = [LIVE_COLLECTION_NAME, LIVE_DASHBOARD_NAME, LIVE_DOCUMENT_NAME];
const TRASHED = [
  TRASHED_COLLECTION_NAME,
  TRASHED_DASHBOARD_NAME,
  TRASHED_DOCUMENT_NAME,
];

const EMPTY_DOCUMENT = { type: "doc", content: [] };

function createContent() {
  H.createCollection({ name: LIVE_COLLECTION_NAME });
  H.createDashboard({ name: LIVE_DASHBOARD_NAME });
  H.createDocument({ name: LIVE_DOCUMENT_NAME, document: EMPTY_DOCUMENT });

  H.createCollection({ name: TRASHED_COLLECTION_NAME }).then(
    ({ body: collection }) => H.archiveCollection(collection.id),
  );
  H.createDashboard({ name: TRASHED_DASHBOARD_NAME }).then(
    ({ body: dashboard }) => H.archiveDashboard(dashboard.id),
  );
  H.createDocument({
    name: TRASHED_DOCUMENT_NAME,
    document: EMPTY_DOCUMENT,
  }).then(({ body: document }) => H.archiveDocument(document.id));
}

describe("scenarios > monitor > content diagnostics > archived", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("reports live content and passes over its archived counterparts", () => {
    createContent();
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.log("every live entity is reported");
    cy.findByTestId("imbalanced-content-list").within(() => {
      LIVE.forEach((name) => {
        cy.findByText(name).should("be.visible");
      });
    });

    cy.log("and none of the archived ones are");
    TRASHED.forEach((name) => {
      cy.findByTestId("imbalanced-content-list").should(
        "not.contain.text",
        name,
      );
    });
  });
});
