const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { dayjs } from "metabase/dayjs";

import {
  markStale,
  runContentDiagnosticsScan,
  searchFindings,
  setThreshold,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const SEARCH_TERM = "transforming";

const ARCHIVED_FOLDER_NAME = "E2E transforming archived folder";
const ARCHIVED_TRANSFORM_NAME = "E2E transforming archived-folder transform";
const SLOW_TRANSFORM_NAME = "E2E transforming slow transform";
const STALE_TRANSFORM_NAME = "E2E transforming stale transform";
const SCHEDULED_TRANSFORM_NAME = "E2E transforming scheduled transform";
const UNSCHEDULED_TRANSFORM_NAME = "E2E transforming unscheduled transform";
const DUPLICATED_TRANSFORM_NAME = "E2E transforming duplicated transform";
const DELETED_TRANSFORM_NAME = "E2E transforming deleted transform";

const TARGET_SCHEMA = "public";

const SLEEP_SECONDS = 2;
const SLOW_THRESHOLD_SECONDS = 1;
const SECONDS_DURATION = /^\d+\.\ds$/;

const LAST_RUN_DAYS_AGO = 120;
const lastRunOn = () =>
  dayjs().subtract(LAST_RUN_DAYS_AGO, "day").format("YYYY-MM-DD");

const yearlyCronAwayFromNow = () =>
  `0 0 0 1 ${dayjs().add(6, "month").month() + 1} ?`;

function createTransformInArchivedFolder() {
  H.createTransformCollection({ name: ARCHIVED_FOLDER_NAME }).then(
    ({ body: collection }) => {
      H.createTransform({
        name: ARCHIVED_TRANSFORM_NAME,
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
          name: "e2e_transforming_archived",
          schema: TARGET_SCHEMA,
        },
      }).then(({ body: transform }) => markStale("transform", transform.id));

      H.archiveCollection(collection.id);
    },
  );
}

function findingRow(name: string) {
  return cy.findByTestId("stale-content-list").contains('[role="row"]', name);
}

function createTransformNamed(name: string, targetTable: string) {
  return H.createTransform({
    name,
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
      name: targetTable,
      schema: TARGET_SCHEMA,
    },
  });
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
        .findByText(ARCHIVED_TRANSFORM_NAME)
        .should("be.visible");

      cy.findByTestId("stale-content-list")
        .findByText(ARCHIVED_TRANSFORM_NAME)
        .click();
      cy.findByTestId("content-diagnostics-sidebar")
        .findByText("Last run")
        .should("be.visible");
    });

    it("reports a transform whose run exceeded the threshold", () => {
      setThreshold(
        "content-diagnostics-slow-transform-threshold-seconds",
        SLOW_THRESHOLD_SECONDS,
      );
      H.createAndRunSqlTransform({
        name: SLOW_TRANSFORM_NAME,
        sourceQuery: `SELECT pg_sleep(${SLEEP_SECONDS}) IS NULL AS napped`,
        targetTable: "e2e_transforming_slow",
        targetSchema: TARGET_SCHEMA,
      });
      runContentDiagnosticsScan();

      visitContentDiagnosticsTab("slow");
      searchFindings(SEARCH_TERM);

      cy.findByTestId("slow-content-list")
        .findByText(SLOW_TRANSFORM_NAME)
        .should("be.visible");

      cy.findByTestId("slow-content-list")
        .findByText(SLOW_TRANSFORM_NAME)
        .click();
      cy.findByTestId("content-diagnostics-sidebar").within(() => {
        cy.findByText("Duration").should("be.visible");
        cy.findByText(SECONDS_DURATION).should("be.visible");
      });
    });

    it("reports a transform whose last run predates the threshold", () => {
      H.createAndRunSqlTransform({
        name: STALE_TRANSFORM_NAME,
        sourceQuery: "SELECT 1 AS id",
        targetTable: "e2e_transforming_stale",
        targetSchema: TARGET_SCHEMA,
      }).then(({ transformId }) =>
        markStale("transform", transformId, lastRunOn()),
      );
      runContentDiagnosticsScan();

      visitContentDiagnosticsTab("stale");
      searchFindings(SEARCH_TERM);

      cy.findByTestId("stale-content-list")
        .findByText(STALE_TRANSFORM_NAME)
        .should("be.visible");
    });

    it("clusters transforms that share a name", () => {
      createTransformNamed(
        DUPLICATED_TRANSFORM_NAME,
        "e2e_transforming_duplicated_a",
      );
      createTransformNamed(
        DUPLICATED_TRANSFORM_NAME,
        "e2e_transforming_duplicated_b",
      );
      runContentDiagnosticsScan();

      visitContentDiagnosticsTab("duplicated");
      searchFindings(SEARCH_TERM);

      cy.findByTestId("duplicated-content-list")
        .findAllByText(DUPLICATED_TRANSFORM_NAME)
        .should("have.length", 2);

      cy.log("and each side names the other as its duplicate");
      cy.findByTestId("duplicated-content-list")
        .findAllByText(DUPLICATED_TRANSFORM_NAME)
        .first()
        .click();

      cy.findByTestId("content-diagnostics-sidebar").within(() => {
        cy.findByText("Duplicates (1)").should("be.visible");
        cy.findByRole("region", { name: "Duplicates" }).should(
          "contain.text",
          DUPLICATED_TRANSFORM_NAME,
        );
      });
    });

    // A transform has no archived state, so bulk removal deletes it outright, and the bar
    // says so instead of offering the trash.
    it("permanently deletes a selected transform instead of trashing it", () => {
      let transformId = 0;

      H.createAndRunSqlTransform({
        name: DELETED_TRANSFORM_NAME,
        sourceQuery: "SELECT 1 AS id",
        targetTable: "e2e_transforming_deleted",
        targetSchema: TARGET_SCHEMA,
      }).then((transform) => {
        transformId = transform.transformId;
        markStale("transform", transformId, lastRunOn());
      });
      runContentDiagnosticsScan();

      visitContentDiagnosticsTab("stale");
      searchFindings(SEARCH_TERM);

      findingRow(DELETED_TRANSFORM_NAME).findByRole("checkbox").click();

      cy.findByTestId("toast-card").within(() => {
        cy.findByText("1 item selected").should("be.visible");
        cy.findByRole("button", { name: "Delete" }).click();
      });

      cy.log("the confirmation drops the trash wording for a permanent delete");
      H.modal().within(() => {
        cy.findByText("Delete 1 transform?").should("be.visible");
        cy.findByText(
          "1 transform will be permanently deleted and cannot be restored.",
        ).should("be.visible");
        cy.findByRole("button", { name: "Delete" }).click();
      });

      H.undoToast().findByText("Removed 1 item").should("be.visible");

      cy.log("the finding is invalidated and the transform itself is gone");
      cy.findByTestId("stale-content-list").should(
        "not.contain.text",
        DELETED_TRANSFORM_NAME,
      );
      cy.then(() => {
        cy.request({
          url: `/api/transform/${transformId}`,
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 404);
      });
    });

    it("leaves a transform between fires of its schedule out of stale", () => {
      H.createTransformTag({ name: "E2E transforming tag" }).then(
        ({ body: tag }) => {
          H.createTransformJob({
            name: "E2E transforming job",
            schedule: yearlyCronAwayFromNow(),
            tag_ids: [tag.id],
          });

          H.createAndRunSqlTransform({
            name: SCHEDULED_TRANSFORM_NAME,
            sourceQuery: "SELECT 1 AS id",
            targetTable: "e2e_transforming_scheduled",
            targetSchema: TARGET_SCHEMA,
            tagIds: [tag.id],
          }).then(({ transformId }) =>
            markStale("transform", transformId, lastRunOn()),
          );
        },
      );

      H.createAndRunSqlTransform({
        name: UNSCHEDULED_TRANSFORM_NAME,
        sourceQuery: "SELECT 1 AS id",
        targetTable: "e2e_transforming_unscheduled",
        targetSchema: TARGET_SCHEMA,
      }).then(({ transformId }) =>
        markStale("transform", transformId, lastRunOn()),
      );

      runContentDiagnosticsScan();

      visitContentDiagnosticsTab("stale");
      searchFindings(SEARCH_TERM);

      cy.log("the unscheduled one is overdue and reported");
      cy.findByTestId("stale-content-list")
        .findByText(UNSCHEDULED_TRANSFORM_NAME)
        .should("be.visible");

      cy.log("the scheduled one is merely between fires, so it is left out");
      cy.findByTestId("stale-content-list").should(
        "not.contain.text",
        SCHEDULED_TRANSFORM_NAME,
      );
    });
  },
);
