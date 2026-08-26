const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

import {
  markStale,
  runContentDiagnosticsScan,
  searchFindings,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const SEARCH_TERM = "exemption";
const COLLECTION_NAME = "E2E exemption transform folder";
const TRANSFORM_NAME = "E2E exemption transform";

function createTransformInArchivedFolder() {
  H.createTransformCollection({ name: COLLECTION_NAME }).then(
    ({ body: collection }) => {
      H.createTransform({
        name: TRANSFORM_NAME,
        collection_id: collection.id,
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "native",
            native: { query: "SELECT 1 AS id" },
          },
        },
        target: {
          type: "table",
          database: WRITABLE_DB_ID,
          name: "e2e_exemption_target",
          schema: "public",
        },
      }).then(({ body: transform }) => markStale("transform", transform.id));

      H.archiveCollection(collection.id);
    },
  );
}

describe(
  "scenarios > monitor > content diagnostics > transforms",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
    });

    // Archiving a folder takes its cards, dashboards and documents out of scope, but a transform runs on
    // its schedule regardless of the folder it sits in, so it stays in scope.
    it("still reports a stale transform whose folder has been archived", () => {
      createTransformInArchivedFolder();
      runContentDiagnosticsScan();

      visitContentDiagnosticsTab("stale");
      searchFindings(SEARCH_TERM);

      cy.findByTestId("stale-content-list")
        .findByText(TRANSFORM_NAME)
        .should("be.visible");

      cy.findByTestId("stale-content-list").findByText(TRANSFORM_NAME).click();
      cy.findByTestId("content-diagnostics-sidebar")
        .findByText("Last run")
        .should("be.visible");
    });
  },
);
