import type { Page, Response } from "@playwright/test";

import { editDashboardCard } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import {
  createNativeQuestion,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import {
  createMetabotSSEBody,
  metabotDataPart,
  metabotTextPart,
  mockMetabotResponse,
} from "../support/metabot";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  THIRD_COLLECTION_ID,
} from "../support/sample-data";
import {
  getNewEmbedConfigurationScript,
  getNewEmbedScriptTag,
  prepareSdkIframeEmbedTest,
  sdkErrorContainer,
  visitCustomHtmlPage,
} from "../support/sdk-iframe";
import {
  ORDERS_COUNT_QUESTION_ID,
  loadedEmbedFrame,
  pasteText,
} from "../support/sdk-iframe-custom-elements-api";
import { modal, visitQuestion } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding/custom-elements-api.cy.spec.ts
 *
 * Group A of the SDK-iframe tier: it needs the `embed.js` harness
 * (`support/sdk-iframe.ts`), whose URL/CORS/private-network groundwork is
 * described in `findings-inbox/sdk-iframe-harness.md` and consumed here
 * unmodified.
 *
 * Port notes:
 * - Every one of the 31 `H.visitCustomHtmlPage(...)` calls is a literal HTML
 *   document, so the three hardcoded `http://localhost:4000`s upstream bakes in
 *   (script `src`, `instanceUrl`, page origin) all come from `mb.baseUrl` via
 *   `getNewEmbedScriptTag(mb)` / `getNewEmbedConfigurationScript(mb, …)`.
 * - `H.getSimpleEmbedIframeContent()` is NOT a bare `FrameLocator`: it blocks on
 *   `data-metabase-embed` + `data-iframe-loaded` before yielding the body. That
 *   gate is what makes the original's `should("not.exist")` assertions run
 *   against a *loaded* embed rather than an empty one, so it is reproduced by
 *   `loadedEmbedFrame` (support/sdk-iframe-custom-elements-api.ts) rather than
 *   dropped.
 * - `should("not.exist")` → `toHaveCount(0)`. These are the same assertion:
 *   both pass at the first observation where the element is absent and neither
 *   re-checks afterwards. (The one-shot `expect(await loc.count()).toBe(0)`
 *   form is *stricter* than the Cypress original — it would fail on an element
 *   that is transiently present — so it is not the faithful port here.)
 * - VACUOUS ABSENCE ASSERTIONS, and what was done about them. `data-iframe-loaded`
 *   is set well before the embed's body paints, so a `not.exist` taken right
 *   after it passes whatever the app does. Verified by mutation: flipping the
 *   `with-title="false"` attribute to `"true"` left "should hide title when
 *   with-title is false" GREEN. ALL EIGHT tests of this shape were confirmed
 *   vacuous by mutation and all eight now carry an anchor, called out inline —
 *   six on rendered content, and the two `drills="false"` popover checks on a
 *   bounded settle (no DOM signal exists for "the click was ignored"). Each was
 *   re-mutated afterwards to confirm it now fails for the right reason.
 * - `cy.intercept().as()` + `cy.wait("@…")` → `page.waitForResponse` armed
 *   before the triggering action (rule 2). The aliases upstream registers in
 *   `prepareSdkIframeEmbedTest` (`@getCardQuery`, `@getDashCardQuery`,
 *   `@getDashboard`) are not registered by the ported prepare fn; the two tests
 *   that actually await them arm their own.
 * - `beforeEach`'s leading `cy.signInAsAdmin()` is redundant — the very next
 *   call (`prepareSdkIframeEmbedTest`) restores and signs in as admin itself.
 * - `cy.paste()` is a custom command, ported as `pasteText`.
 * - `findAllByText(x).should("be.visible")` is an ANY-of-set assertion
 *   (rule 3) → `.filter({ visible: true }).first()`.
 */

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

/** Port of the `@getDashCardQuery` alias: POST /api/dashboard/&#42;&#42;/query. */
function waitForDashCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.startsWith("/api/dashboard/") &&
      new URL(response.url()).pathname.endsWith("/query"),
    { timeout: 60_000 },
  );
}

/** Port of the `@getCardQuery` alias: POST /api/card/&#42;/query. */
function waitForCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/[^/]+\/query$/.test(new URL(response.url()).pathname),
    { timeout: 60_000 },
  );
}

test.describe("scenarios > embedding > sdk iframe embedding > custom elements api", () => {
  test.beforeEach(async ({ page, mb }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      withToken: "bleeding-edge",
    });
  });

  test.describe("<metabase-dashboard>", () => {
    test("should embed a dashboard with <metabase-dashboard dashboard-id='${number}'>", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}

      ${getNewEmbedConfigurationScript(mb, {})}

      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      await expect(frame.locator("body")).toContainText("Orders in a dashboard");
    });

    test("should allow setting initial parameters and hidden parameters via `initial-parameters` and `hidden-parameters` attributes", async ({
      page,
      mb,
    }) => {
      const DASHBOARD_PARAMETERS = [
        { name: "ID", slug: "id", id: "11111111", type: "id" },
        { name: "Product ID", slug: "product_id", id: "22222222", type: "id" },
      ];

      const card = await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "Orders table",
          query: { "source-table": ORDERS_ID },
        },
        dashboardDetails: {
          name: "Dashboard with Parameters",
          parameters: DASHBOARD_PARAMETERS,
        },
      });

      await editDashboardCard(mb.api, card, {
        parameter_mappings: DASHBOARD_PARAMETERS.map((parameter) => ({
          card_id: card.card_id,
          parameter_id: parameter.id,
          target: ["dimension", ["field", ORDERS.ID, null]],
        })),
      });

      const dashboardId = card.dashboard_id;

      await visitCustomHtmlPage(
        page,
        mb,
        `
          ${getNewEmbedScriptTag(mb)}
          ${getNewEmbedConfigurationScript(mb, {})}

          <metabase-dashboard dashboard-id="${dashboardId}" initial-parameters='{"id": "123"}' hidden-parameters='["product_id"]' />
          `,
      );

      const frame = await loadedEmbedFrame(page);
      const parameters = frame.getByTestId(
        "dashboard-parameters-widget-container",
      );
      await expect(parameters.getByLabel("ID", { exact: true })).toContainText(
        "123",
      );
      await expect(
        parameters.getByLabel("Product ID", { exact: true }),
      ).toHaveCount(0);

      // make sure the filter is applied
      await expect(frame.getByText("1 row", { exact: true })).toBeAttached();
    });

    test("should respect the theme passed to the configuration function", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}

      ${getNewEmbedConfigurationScript(mb, {
        theme: { colors: { brand: "#123456" } },
      })}

      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      // the color is applied via rgb, not via hex
      await expect(frame.getByText("User ID", { exact: true })).toHaveCSS(
        "color",
        "rgb(18, 52, 86)",
      );
    });

    test("should show title when with-title is passed with no value", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-title />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      await expect(
        frame.getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();
    });

    test("should show title when with-title is 'true'", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-title="true" />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      await expect(
        frame.getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();
    });

    test("should hide title when with-title is false", async ({ page, mb }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-title="false" />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      // STRENGTHENED vs upstream — see the header note on vacuous absence
      // assertions. `data-iframe-loaded` fires before the dashboard body
      // paints, so the bare absence check passes even when the title IS shown
      // (verified by mutation). Anchor on rendered dashboard content first.
      await expect(frame.getByText("User ID", { exact: true })).toBeVisible();
      await expect(
        frame.getByText("Orders in a dashboard", { exact: true }),
      ).toHaveCount(0);
    });

    test("should show download button when with-downloads is true", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-downloads />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      await expect(
        frame.getByLabel("Download as PDF", { exact: true }),
      ).toBeVisible();
    });

    test("should hide download button when with-downloads is false", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-downloads="false" />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      // STRENGTHENED vs upstream — anchor on rendered dashboard content before
      // the absence check (see the header note).
      await expect(frame.getByText("User ID", { exact: true })).toBeVisible();
      await expect(
        frame.getByLabel("Download as PDF", { exact: true }),
      ).toHaveCount(0);
    });

    test("should enable drill-through when drills is true", async ({
      page,
      mb,
    }) => {
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "Limited Orders",
          query: { "source-table": ORDERS_ID, limit: 5 },
        },
      });

      await visitCustomHtmlPage(
        page,
        mb,
        `
        ${getNewEmbedScriptTag(mb)}
        ${getNewEmbedConfigurationScript(mb)}
        <metabase-dashboard dashboard-id="${dashboard_id}" drills />
        `,
      );

      const frame = await loadedEmbedFrame(page);
      const cell = frame.getByText("37.65", { exact: true }).first();
      await expect(cell).toBeVisible();
      await cell.click();
      await expect(frame.getByText(/Filter by this value/)).toBeVisible();
    });

    test("should disable drill-through when drills is false", async ({
      page,
      mb,
    }) => {
      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "Limited Orders",
          query: { "source-table": ORDERS_ID, limit: 5 },
        },
      });

      const dashCardQuery = waitForDashCardQuery(page);

      await visitCustomHtmlPage(
        page,
        mb,
        `
        ${getNewEmbedScriptTag(mb)}
        ${getNewEmbedConfigurationScript(mb)}
        <metabase-dashboard dashboard-id="${dashboard_id}" drills="false" />
        `,
      );

      await dashCardQuery;

      const frame = await loadedEmbedFrame(page);
      const cell = frame.getByText("37.65", { exact: true }).first();
      await expect(cell).toBeVisible();
      await cell.click({ force: true });
      // STRENGTHENED vs upstream — a bare absence check right after the click
      // fires before any drill popover could have opened, and stays green when
      // the attribute is mutated back to drills-enabled. There is no DOM signal
      // for "the click was ignored", so this is a bounded negative: the drill
      // popover opens at ~243ms when drills ARE enabled (measured on this
      // backend), so a 3s settle is a >12x margin.
      await page.waitForTimeout(3000);
      await expect(frame.getByText(/Filter by this value/)).toHaveCount(0);
    });
  });

  test.describe("<metabase-question>", () => {
    test("should embed a question with <metabase-question question-id='${number}'>", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}

      ${getNewEmbedConfigurationScript(mb)}

      <metabase-question question-id="${ORDERS_QUESTION_ID}" />
      `,
      );

      const frame = await loadedEmbedFrame(page, { index: 0 });
      await expect(frame.getByText("Orders", { exact: true })).toBeAttached();
    });

    test("should allow rendering two different questions in the same page", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}

      <div style="display: flex; flex-direction: row; gap: 10px;">
        <div>
          <p>Question ${ORDERS_QUESTION_ID}</p>
          <metabase-question question-id="${ORDERS_QUESTION_ID}" />
        </div>
        <div>
          <p>Question ${ORDERS_COUNT_QUESTION_ID}</p>
          <metabase-question question-id="${ORDERS_COUNT_QUESTION_ID}" />
        </div>
      </div>
      `,
      );

      const first = await loadedEmbedFrame(page, { index: 0, count: 2 });
      const second = await loadedEmbedFrame(page, { index: 1, count: 2 });

      await expect(first.getByText("Orders", { exact: true })).toBeAttached({
        timeout: 10_000,
      });
      await expect(
        second.getByText("Orders, Count", { exact: true }),
      ).toBeAttached({ timeout: 10_000 });
    });

    test("should show title when with-title is true", async ({ page, mb }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-title />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      await expect(frame.getByText("Orders", { exact: true })).toBeVisible();
    });

    test("should hide title when with-title is false", async ({ page, mb }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-title="false" />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      // STRENGTHENED vs upstream — anchor on the rendered question before the
      // absence check (see the header note).
      await expect(frame.getByTestId("table-root")).toBeVisible();
      await expect(frame.getByText("Orders", { exact: true })).toHaveCount(0);
    });

    test("should show download button when with-downloads is true", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-downloads />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      await expect(
        frame.getByLabel("download icon", { exact: true }),
      ).toBeVisible();
    });

    test("should hide download button when with-downloads is false", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-downloads="false" />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      // STRENGTHENED vs upstream — anchor on the rendered question before the
      // absence check (see the header note).
      await expect(frame.getByTestId("table-root")).toBeVisible();
      await expect(
        frame.getByLabel("download icon", { exact: true }),
      ).toHaveCount(0);
    });

    test("should enable drill-through when drills is true", async ({
      page,
      mb,
    }) => {
      const { id: questionId } = await createQuestion(mb.api, {
        name: "Limited Orders",
        query: { "source-table": ORDERS_ID, limit: 5 },
      });

      const cardQuery = waitForCardQuery(page);

      await visitCustomHtmlPage(
        page,
        mb,
        `
        ${getNewEmbedScriptTag(mb)}
        ${getNewEmbedConfigurationScript(mb)}
        <metabase-question question-id="${questionId}" drills />
        `,
      );

      await cardQuery;

      const frame = await loadedEmbedFrame(page);

      // Wait for the table to finish rendering before interacting,
      // as column auto-sizing can cause re-renders that detach elements.
      await expect(frame.getByTestId("table-root")).toHaveAttribute(
        "data-rows-count",
        "5",
      );

      const cell = frame.getByText("37.65", { exact: true }).first();
      await expect(cell).toBeVisible();
      await cell.click({ force: true });
      await expect(frame.getByText(/Filter by this value/)).toBeVisible();
    });

    test("should disable drill-through when drills is false", async ({
      page,
      mb,
    }) => {
      const { id: questionId } = await createQuestion(mb.api, {
        name: "Limited Orders",
        query: { "source-table": ORDERS_ID, limit: 5 },
      });

      const cardQuery = waitForCardQuery(page);

      await visitCustomHtmlPage(
        page,
        mb,
        `
        ${getNewEmbedScriptTag(mb)}
        ${getNewEmbedConfigurationScript(mb)}
        <metabase-question question-id="${questionId}" drills="false" />
        `,
      );

      await cardQuery;

      const frame = await loadedEmbedFrame(page);

      // Wait for the table to finish rendering before interacting,
      // as column auto-sizing can cause re-renders that detach elements.
      await expect(frame.getByTestId("table-root")).toHaveAttribute(
        "data-rows-count",
        "5",
      );

      const cell = frame.getByText("37.65", { exact: true });
      await expect(cell).toBeVisible();
      await cell.click({ force: true });

      // STRENGTHENED vs upstream — bounded negative, see the dashboard
      // `drills is false` test for the measurement this margin comes from.
      await page.waitForTimeout(3000);
      await expect(frame.getByText(/Filter by this value/)).toHaveCount(0);
    });

    test("should allow saving a question when `is-save-enabled` is true", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-question question-id="new" is-save-enabled />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      await frame.getByText("Orders", { exact: true }).click();
      await expect(frame.getByText("Save", { exact: true })).toBeVisible();
    });

    test("should not allow saving a question when `is-save-enabled` is false", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-question question-id="new" is-save-enabled="false" />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      await frame.getByText("Orders", { exact: true }).click();
      // STRENGTHENED vs upstream — anchor on the picker click having LANDED
      // before the absence check. `question-id="new"` opens the notebook
      // editor, not a run question, so there is no table to anchor on; and a
      // bare `data-step-cell` visibility check is not enough (the empty data
      // step is already mounted, so it resolves in ~3ms and the check fires
      // before the save toolbar mounts — a mutation to `is-save-enabled="true"`
      // stayed green). By the time the step NAMES Orders, the toolbar and its
      // Save button are already in the DOM (measured).
      await expect(frame.getByTestId("data-step-cell")).toContainText("Orders");
      await expect(frame.getByText("Save", { exact: true })).toHaveCount(0);
    });

    test("should set initial sql parameters with `initial-sql-parameters`", async ({
      page,
      mb,
    }) => {
      const { id: questionId } = await createNativeQuestion(mb.api, {
        name: "SQL question with parameter",
        native: {
          query: "select * from orders where id = {{id}}",
          "template-tags": {
            id: {
              id: "6b8b10ef-0104-1047-1e5v-2701dfc64356",
              name: "id",
              "display-name": "ID",
              type: "number",
              required: true,
            },
          },
        },
      });

      await visitCustomHtmlPage(
        page,
        mb,
        `
        ${getNewEmbedScriptTag(mb)}
        ${getNewEmbedConfigurationScript(mb)}
        <metabase-question question-id="${questionId}" initial-sql-parameters='{"id": 123}' />
        `,
      );

      const frame = await loadedEmbedFrame(page);
      await expect(
        frame
          .getByTestId("query-visualization-root")
          .getByText("123", { exact: true }),
      ).toBeVisible();
    });

    test("should save a new question to a target collection when `target-collection` is set", async ({
      page,
      mb,
    }) => {
      // Create a new collection to save the question to
      await visitCustomHtmlPage(
        page,
        mb,
        `
          ${getNewEmbedScriptTag(mb)}
          ${getNewEmbedConfigurationScript(mb)}
          <metabase-question question-id="new" drills="false" is-save-enabled target-collection="${THIRD_COLLECTION_ID}" />
        `,
      );

      const frame = await loadedEmbedFrame(page);

      // Upstream registers this intercept after the visit; Playwright must arm
      // it before the action that fires it (rule 2).
      const createCard = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/card",
      );

      // Create a new question and save it
      await frame.getByText("Orders", { exact: true }).click();
      await frame.getByText("Save", { exact: true }).click();

      const dialog = frame.getByRole("dialog");
      // Cypress's `findByRole("dialog").within(...)` carries an implicit
      // existence assertion on the dialog; without it the `not.exist` below
      // passes trivially on a page that never opened the modal.
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText("Where do you want to save this?", { exact: true }),
      ).toHaveCount(0);
      await dialog.getByRole("button", { name: "Save", exact: true }).click();

      const response = await createCard;
      expect((await response.json()).collection_id).toEqual(
        THIRD_COLLECTION_ID,
      );
    });
  });

  test.describe("<metabase-metabot>", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.api.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
    });

    test("should handle scrolling gracefully (metabase#67399)", async ({
      page,
      mb,
    }) => {
      const question = `
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      `;

      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-metabot />
      `,
      );

      const frame = await loadedEmbedFrame(page);

      // metabot chat should be interactive
      await expect(
        frame.getByText("Ask questions to AI.", { exact: true }),
      ).toBeVisible();

      const input = frame.getByPlaceholder("Ask AI a question...", {
        exact: true,
      });
      await pasteText(input, question);
      await input.press("Enter");

      // Making sure the ChatInput is still within the viewport
      await expect(input).toBeVisible();
    });

    test("should load the embedded Metabot component", async ({ page, mb }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-metabot />
      `,
      );

      const frame = await loadedEmbedFrame(page);

      // metabot chat should be interactive
      await expect(
        frame.getByText("Ask questions to AI.", { exact: true }),
      ).toBeVisible();

      const input = frame.getByPlaceholder("Ask AI a question...", {
        exact: true,
      });
      await input.click();
      await input.pressSequentially("Foo");
      await input.press("Enter");
      await expect(frame.getByText(/Something went wrong/)).toBeVisible();

      // uses sidebar layout by default when no layout attribute is provided
      await expect(
        frame.getByTestId("metabot-question-container"),
      ).toHaveAttribute("data-layout", "sidebar");

      // should show disclaimer text in sidebar layout
      await expect(
        frame
          .getByText("AI isn't perfect. Double-check results.", { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
    });

    test("should apply the data-layout attribute when layout is set to stacked", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-metabot layout="stacked" />
      `,
      );

      const frame = await loadedEmbedFrame(page);
      await expect(
        frame.getByTestId("metabot-question-container"),
      ).toHaveAttribute("data-layout", "stacked");

      // should show disclaimer text in stacked layout
      await expect(
        frame
          .getByText("AI isn't perfect. Double-check results.", { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
    });

    test.describe("saving a metabot question", () => {
      const query = {
        "source-table": ORDERS_ID,
        aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        limit: 2,
      };
      const adHocQuestionPath = `/question#${btoa(
        JSON.stringify({
          dataset_query: { database: 1, type: "query", query },
          display: "table",
          displayIsLocked: true,
          visualization_settings: {},
        }),
      )}`;

      const metabotResponseWithNavigateTo = createMetabotSSEBody(
        metabotTextPart(`Here is the [question link](${adHocQuestionPath})`),
        metabotDataPart("navigate_to", adHocQuestionPath),
      );

      test("should allow to save a new question", async ({ page, mb }) => {
        await mockMetabotResponse(page, {
          statusCode: 200,
          body: metabotResponseWithNavigateTo,
        });

        const postCard = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).origin === new URL(mb.baseUrl).origin &&
            new URL(response.url()).pathname === "/api/card",
        );

        // Create a collection
        const collection = await (
          await mb.api.post("/api/collection", {
            name: "first_collection",
            description: "First collection",
            parent_id: undefined,
          })
        ).json();

        // Visit an embed metabase-metabot
        await visitCustomHtmlPage(
          page,
          mb,
          `
            ${getNewEmbedScriptTag(mb)}
            ${getNewEmbedConfigurationScript(mb)}
            <metabase-metabot is-save-enabled="true" target-collection="${collection.id}" />
          `,
        );

        const frame = await loadedEmbedFrame(page);

        // Ask a Metabot to create a question
        // the question doesn't matter, we're stubbing the response
        const input = frame.getByPlaceholder("Ask AI a question...", {
          exact: true,
        });
        await input.click();
        await input.pressSequentially("Show me something");
        await input.press("Enter");

        await frame.getByText("question link", { exact: true }).click();

        await expect(
          frame.getByText("Max of Quantity by Product ID", { exact: true }),
        ).toBeVisible();

        // Save the question
        const saveButton = frame.getByRole("button", {
          name: "Save",
          exact: true,
        });
        await expect(saveButton).toBeVisible();
        await saveButton.click();

        const saveModal = modal(frame);
        await expect(
          saveModal.getByText("Save new question", { exact: true }),
        ).toBeVisible();
        await saveModal
          .getByRole("button", { name: "Save", exact: true })
          .click();

        const questionId = (await (await postCard).json()).id;

        // Open the question
        await visitQuestion(page, questionId);

        // Name of the collection should be visible at the top of the page
        // findAllBy because there are two "first_collection", one in the
        // sidebar and one at the top
        await expect(
          page.getByText("first_collection", { exact: true }).first(),
        ).toBeVisible();
        // Name of the new question should be visible too
        await expect(
          page.getByText(
            "Orders, Max of Quantity, Grouped by Product ID, 2 rows",
            { exact: true },
          ),
        ).toBeVisible();
      });
    });

    test("should not render metabot when embedded-metabot-enabled? is false", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("embedded-metabot-enabled?", false);

      await visitCustomHtmlPage(
        page,
        mb,
        `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-metabot />
      `,
      );

      const frame = await loadedEmbedFrame(page);

      // STRENGTHENED vs upstream — with metabot disabled the embed renders an
      // explicit error, which is a real anchor for the absence checks below.
      // Without it they fire before the component has rendered anything and
      // pass even when metabot IS enabled (verified by mutation).
      await expect(sdkErrorContainer(frame)).toContainText(
        "Metabot is not enabled for embedded analytics.",
      );

      // When embedded metabot is disabled, the component should not render the
      // chat interface
      await expect(
        frame.getByText("Ask questions to AI.", { exact: true }),
      ).toHaveCount(0);
      await expect(
        frame.getByPlaceholder("Ask AI a question...", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("common checks", () => {
    test.describe("should be permissive with json attributes", () => {
      // NOTE: pay attention if you use initialFilters for these tests, as when
      // the filters are not parsed correctly we default them to the latest
      // filters used by that user
      test("should support normal json with strings wrapped in double quotes", async ({
        page,
        mb,
      }) => {
        await visitCustomHtmlPage(
          page,
          mb,
          `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-question question-id="new" entity-types='["table"]' />
      `,
        );

        const frame = await loadedEmbedFrame(page);
        await expect(frame.locator("body")).toContainText("Orders");
        await expect(frame.locator("body")).not.toContainText("Orders model");
      });

      test("should support json5 with strings wrapped in single quotes", async ({
        page,
        mb,
      }) => {
        await visitCustomHtmlPage(
          page,
          mb,
          `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb)}
      <metabase-question question-id="new" entity-types="['table']" />
      `,
        );

        const frame = await loadedEmbedFrame(page);
        await expect(frame.locator("body")).toContainText("Orders");
        await expect(frame.locator("body")).not.toContainText("Orders model");
      });
    });

    test("should not define color-scheme meta tag on embeds (metabase#65533)", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
        ${getNewEmbedScriptTag(mb)}
        ${getNewEmbedConfigurationScript(mb)}
        <metabase-question question-id="new" />
      `,
      );

      const frame = await loadedEmbedFrame(page);

      // a generic meta tag should exist
      await expect(frame.locator("meta[name='viewport']").first()).toBeAttached();

      // the color-scheme tag should not exist on EAJS embeds
      await expect(frame.locator("meta[name='color-scheme']")).toHaveCount(0);
    });
  });

  test.describe("sync vs async vs defer script loading", () => {
    (["sync", "async", "defer"] as const).forEach((loadType) => {
      test(`should work correctly when the script is loaded ${loadType}`, async ({
        page,
        mb,
      }) => {
        await visitCustomHtmlPage(
          page,
          mb,
          `
          ${getNewEmbedScriptTag(mb, { loadType })}
          ${getNewEmbedConfigurationScript(mb, {
            theme: { colors: { brand: "#FF0000" } },
          })}
          <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" />

          <button onclick="defineMetabaseConfig({ theme: { colors: { brand: '#00FF00' } } })">Change theme</button>
        `,
        );

        // Check if the dashboard is loaded
        const frame = await loadedEmbedFrame(page);
        await expect(frame.locator("body")).toContainText(
          "Orders in a dashboard",
        );

        // Check that the initial theme is applied
        await expect(frame.getByText("User ID", { exact: true })).toHaveCSS(
          "color",
          "rgb(255, 0, 0)",
        );

        // Check that calling defineMetabaseConfig after the initial load works
        await page.getByText("Change theme", { exact: true }).click();

        await expect(frame.getByText("User ID", { exact: true })).toHaveCSS(
          "color",
          "rgb(0, 255, 0)",
        );
      });
    });
  });
});
