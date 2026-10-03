/**
 * Playwright port of e2e/test/scenarios/data-apps/actions.cy.spec.ts
 *
 * Exercises the SDK `useAction` hook inside the sandboxed data-app iframe: it
 * executes a model's implicit "create" action against the writable QA Postgres,
 * exposing isExecuting/result/error and reset, and surfaces a real DB rejection
 * (a duplicate unique key).
 *
 * Infra tier: @external + @actions → writable QA Postgres (writable_db) AND the
 * data-apps EE feature. Gated on BOTH PW_QA_DB_ENABLED and
 * resolveToken("bleeding-edge"). The knex writable-DB helpers come from
 * support/actions-on-dashboards.ts (queryWritableDB / resetTestTable /
 * createModelFromTableName / createImplicitAction), setActionsEnabledForDB from
 * support/command-palette.ts, resyncDatabase from support/schema-viewer.ts —
 * the same modules the actions-on-dashboards / model-actions ports use.
 *
 * Port notes:
 * - H.mockDataApp / dataAppIframe / visitDataAppRoute → support/data-apps.ts.
 * - cy.intercept("POST","/api/action/*­/execute", res.setDelay(300)) → a
 *   page.route that sleeps 300ms before route.continue(). Cypress delays the
 *   RESPONSE; delaying the request start keeps `isExecuting` observable for the
 *   same window, which is all the assertion needs. The execute call originates
 *   inside the iframe; page.route is context-level and intercepts it.
 * - `@modelId` cy alias → a local `modelId` captured from
 *   createModelFromTableName (which returns the id).
 * - findByTestId(...).should("have.text", x) → toHaveText(x) (rule 1; single
 *   words, whitespace-normalization is a no-op here).
 */
import type { Page } from "@playwright/test";

import { resolveToken } from "../support/api";
import {
  createImplicitAction,
  createModelFromTableName,
  queryWritableDB,
  resetTestTable,
} from "../support/actions-on-dashboards";
import { setActionsEnabledForDB } from "../support/command-palette";
import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  DATA_APP_TEST_ENV as TEST_ENV,
  dataAppIframe,
  mockDataApp,
  visitDataAppRoute,
} from "../support/data-apps";
import { expect, test } from "../support/fixtures";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";

const TEST_TABLE = "scoreboard_actions";
const MODEL_NAME = "Scoreboard model";
const EXISTING_TEAM = "Amorous Aardvarks";

test.describe("scenarios > data apps > actions (useAction)", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED || !resolveToken("bleeding-edge"),
    "Requires the writable QA Postgres database (writable_db, set PW_QA_DB_ENABLED) and the bleeding-edge (MB_ALL_FEATURES_TOKEN) token for the data-apps feature",
  );

  let modelId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");

    await resetTestTable({ type: "postgres", table: TEST_TABLE });
    await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID, tables: [TEST_TABLE] });
    await setActionsEnabledForDB(mb.api, WRITABLE_DB_ID);
    modelId = await createModelFromTableName(mb.api, {
      tableName: TEST_TABLE,
      modelName: MODEL_NAME,
    });
  });

  const setupActionsApp = async (
    page: Page,
    mb: { api: import("../support/api").MetabaseApi },
    actionParams: Record<string, string | number>,
  ) => {
    const action = await createImplicitAction(mb.api, {
      model_id: modelId,
      kind: "create",
    });
    await mockDataApp(page, APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: { ...TEST_ENV, actionId: action.id, actionParams },
    });
  };

  test("executes the action, exposing isExecuting and result, and resets", async ({
    page,
    mb,
  }) => {
    // Delay the execute request so `isExecuting` is observable (upstream delays
    // the response by 300ms via res.setDelay).
    await page.route(
      (url) => /^\/api\/action\/\d+\/execute$/.test(url.pathname),
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.continue();
      },
    );

    await setupActionsApp(page, mb, { team_name: "Data App FC", score: 7 });

    await visitDataAppRoute(page, mb.baseUrl, "actions");
    const iframe = dataAppIframe(page, APP_DISPLAY_NAME);

    await iframe.getByTestId("action-execute").click();
    await expect(iframe.getByTestId("action-executing")).toHaveText(
      "executing",
    );

    await expect(iframe.getByTestId("action-result")).toHaveText("has-result", {
      timeout: 30_000,
    });
    await expect(iframe.getByTestId("action-output")).toHaveText(
      "returned-result",
    );
    await expect(iframe.getByTestId("action-error")).toHaveText("no-error");

    await iframe.getByTestId("action-reset").click();
    await expect(iframe.getByTestId("action-result")).toHaveText("no-result");

    const { rows } = await queryWritableDB(
      `SELECT team_name, score FROM ${TEST_TABLE} WHERE team_name = 'Data App FC'`,
      "postgres",
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].score)).toBe(7);
  });

  test("surfaces an error when the action fails", async ({ page, mb }) => {
    // `team_name` is unique, so creating a team that already exists fails in the
    // database — a real rejection, not a stubbed one.
    await setupActionsApp(page, mb, { team_name: EXISTING_TEAM, score: 1 });

    await visitDataAppRoute(page, mb.baseUrl, "actions");
    const iframe = dataAppIframe(page, APP_DISPLAY_NAME);

    await iframe.getByTestId("action-execute").click();

    await expect(iframe.getByTestId("action-error")).toHaveText("has-error", {
      timeout: 30_000,
    });
    await expect(iframe.getByTestId("action-result")).toHaveText("no-result");
    await expect(iframe.getByTestId("action-executing")).toHaveText("idle");

    const { rows } = await queryWritableDB(
      `SELECT team_name FROM ${TEST_TABLE} WHERE team_name = '${EXISTING_TEAM}'`,
      "postgres",
    );
    // Nothing was written — the existing team is still the only one.
    expect(rows).toHaveLength(1);
  });
});
