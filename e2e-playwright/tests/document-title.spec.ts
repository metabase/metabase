/**
 * Playwright port of e2e/test/scenarios/question/document-title.cy.spec.js
 *
 * @external in Cypress: needs the postgres QA database and its postgres-12
 * snapshot, so it is gated on QA_DB_ENABLED like the other QA-DB ports.
 */
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import { queryBuilderMain } from "../support/notebook";
import { adhocQuestionHash } from "../support/permissions";

const PG_DB_ID = 2;

test.describe(
  "question loading changes document title",
  { tag: "@external" },
  () => {
    test.skip(
      !process.env.QA_DB_ENABLED,
      "Requires the postgres QA database and its postgres-12 snapshot (set QA_DB_ENABLED)",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore("postgres-12");
      await mb.signInAsAdmin();
    });

    test("should verify document title changes while loading a slow question (metabase#40051)", async ({
      page,
    }) => {
      // Run a slow question. H.visitQuestionAdhoc ran with skipWaiting: true,
      // so this is a bare navigation — the point is to observe the loading
      // state while pg_sleep(60) keeps the dataset request in flight.
      await page.goto(
        `/question#${adhocQuestionHash({
          dataset_query: {
            type: "native",
            native: { query: "select pg_sleep(60)" },
            database: PG_DB_ID,
          },
        })}`,
      );

      // Native ad-hoc questions don't autorun from the hash — Cypress's
      // visitQuestionAdhoc clicks Run itself (runNativeQuery({ wait: false })).
      await icon(
        page.getByTestId("native-query-editor-container"),
        "play",
      ).click();
      await expect(icon(page, "play")).toHaveCount(0);

      await expect(queryBuilderMain(page)).toContainText("Doing science...");
      await expect(page).toHaveTitle("Doing science... · Metabase");
    });
  },
);
