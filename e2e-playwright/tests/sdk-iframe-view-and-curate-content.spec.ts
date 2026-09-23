import type { FrameLocator, Locator, Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import {
  SIMPLE_EMBED_IFRAME_SELECTOR,
  getNewEmbedConfigurationScript,
  getNewEmbedScriptTag,
  getSimpleEmbedIframe,
  prepareSdkIframeEmbedTest,
  visitCustomHtmlPage,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import { modal } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding/view-and-curate-content.cy.spec.ts
 *
 * (Group A — the embed.js harness, `support/sdk-iframe.ts`, consumed read-only.)
 *
 * Port notes:
 *
 * - `setupEmbed` is spec-local upstream and stays spec-local here; it is the
 *   same `visitCustomHtmlPage(script tag + config script + element)` shape the
 *   eajs-internal-navigation port uses. No new support module was needed — this
 *   spec registers no response aliases, so it does not need (and deliberately
 *   does not add a third copy of) `waitForDashCardQuery`.
 *
 * - `H.getSimpleEmbedIframeContent()` blocks until the embed iframe exists and
 *   its body is non-empty; the Playwright `getSimpleEmbedIframe` returns a lazy
 *   `FrameLocator` immediately. Every test therefore calls
 *   `waitForSimpleEmbedIframesToLoad` to restore that gate. It matters most for
 *   the `should("not.exist")` / `should("not.contain")` checks: they retry but
 *   pass on the first absent poll, so they are only meaningful once the thing
 *   that *would* contain the element has rendered. `expect(loc).toHaveCount(0)`
 *   and `expect(loc).not.toContainText(...)` have the identical semantics and
 *   are the faithful ports; the positive mirror-state anchor preceding each one
 *   — not the assertion form — is what makes them non-vacuous. (An earlier
 *   revision used the non-retrying `expect(await loc.count()).toBe(0)` /
 *   `expect(await loc.textContent()).not.toContain(...)`, which sample a single
 *   instant and are *stricter* than upstream. See PORTING.md.)
 *
 * - `should("contain", …)` / `should("not.contain", …)` are case-sensitive
 *   substring checks against the iframe body's text, ported as
 *   `toContainText` / `not.toContainText` (both retrying, case-sensitive).
 *   Both read `textContent`, which also picks up the embed's
 *   injected `<style>` text — verified not to pollute any assertion here
 *   ("Type" is genuinely absent when only `name` is requested).
 *
 * - KNOWN-VACUOUS UPSTREAM ASSERTION, ported as-is: in
 *   "should pass through data-picker-entity-types parameter", the
 *   `should("not.contain", "Orders model")` half cannot fail — the default
 *   snapshot contains no models at all, so the picker shows no "model"/"Model"
 *   text with OR without `data-picker-entity-types='["table"]'` (measured both
 *   ways). Only the `should("contain", "Orders")` half discriminates. Left
 *   faithful rather than strengthened; see findings-inbox.
 *
 * - `findByText`/`findByTestId` with string args are EXACT in testing-library
 *   (rule 1) → `{ exact: true }` throughout. `cy.button(name)` is
 *   `findByRole("button", { name })`, i.e. also exact.
 *
 * - No `test.skip` gates: the whole file runs on a bleeding-edge token, which
 *   the spike backend has. 15 tests, 15 executed.
 */

/** Port of the spec-local `setupEmbed`. */
async function setupEmbed(
  page: Page,
  mb: Parameters<typeof visitCustomHtmlPage>[1],
  elementHtml: string,
): Promise<FrameLocator> {
  await visitCustomHtmlPage(
    page,
    mb,
    `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb, {})}
      ${elementHtml}
    `,
  );

  await waitForSimpleEmbedIframesToLoad(page);

  return getSimpleEmbedIframe(page);
}

/** The embed iframe's document body — the subject `H.getSimpleEmbedIframeContent()`
 * yields, and what `should("contain"|"not.contain")` reads. */
function embedBody(frame: FrameLocator): Locator {
  return frame.locator("body");
}

test.describe("scenarios > embedding > sdk iframe embedding > view and curate content", () => {
  test.beforeEach(async ({ page, mb }) => {
    await prepareSdkIframeEmbedTest(page, mb, { withToken: "bleeding-edge" });
  });

  test.describe("<metabase-browser> (read-only mode)", () => {
    test("should show a collection browser with collection items", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        '<metabase-browser initial-collection="root" />',
      );

      await expect(embedBody(frame)).toContainText("Name", {
        timeout: 40_000,
      });
      await expect(
        frame.getByText("Orders", { exact: true }).first(),
      ).toBeVisible();
    });

    test("should navigate to question when clicking on a question item", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        '<metabase-browser initial-collection="root" />',
      );

      const orders = frame.getByText("Orders", { exact: true });
      await expect(orders).toBeVisible({ timeout: 40_000 });
      await orders.click();

      // upstream: `cy.get("iframe[data-metabase-embed]").should($iframe => {
      //   expect($iframe.contents().find("body")).to.exist })`. That callback is
      // vacuous in Cypress (a jQuery collection is always truthy), so the only
      // thing it really enforces is that the embed iframe itself resolves.
      // Ported as that, explicitly.
      await expect(page.locator(SIMPLE_EMBED_IFRAME_SELECTOR)).toHaveCount(1);

      // should show question view
      await expect(frame.getByTestId("query-visualization-root")).toBeVisible({
        timeout: 20_000,
      });
    });

    test("should show New Question button and open data picker when clicked", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        '<metabase-browser initial-collection="root" />',
      );

      const newQuestion = frame.getByText("New question", { exact: true });
      await expect(newQuestion).toBeVisible({ timeout: 40_000 });
      await newQuestion.click();

      await expect(
        frame.getByText("Pick your starting data", { exact: true }),
      ).toBeVisible();
    });

    test("should pass through collection-visible-columns parameter", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        `
        <metabase-browser
          initial-collection="root"
          collection-visible-columns='["type", "name"]'
        />
      `,
      );

      const body = embedBody(frame);
      await expect(body).toContainText("Name", { timeout: 40_000 });
      await expect(body).toContainText("Type");

      // ANCHOR above — the absences are taken once the two requested columns
      // have rendered, i.e. against a table that is definitely present, not a
      // blank frame.
      await expect(body).not.toContainText("Last edited by");
      await expect(body).not.toContainText("Last edited at");
    });

    test("should pass through collection-page-size parameter", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        `
        <metabase-browser
          initial-collection="root"
          collection-page-size="5"
        />
      `,
      );

      // should show exactly 5 collection entries
      await expect(frame.getByTestId("collection-entry-type")).toHaveCount(5, {
        timeout: 40_000,
      });
    });

    test("should hide New Question button when with-new-question is false", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        `
        <metabase-browser
          initial-collection="root"
          with-new-question="false"
        />
      `,
      );

      // Positive anchor for the absence check below: the collection
      // browser (which is what would carry the "New question" button) has
      // rendered its table.
      await expect(embedBody(frame)).toContainText("Name", { timeout: 40_000 });
      await expect(
        frame.getByText("Orders", { exact: true }).first(),
      ).toBeVisible();

      await expect(
        frame.getByText("New question", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("<metabase-browser> (read-write mode)", () => {
    test("should show New Dashboard button and open modal when clicked", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        '<metabase-browser initial-collection="root" read-only="false" />',
      );

      const newDashboard = frame.getByText("New dashboard", { exact: true });
      await expect(newDashboard).toBeVisible({ timeout: 40_000 });
      await newDashboard.click();

      // should show create dashboard modal
      await expect(
        modal(frame).getByText("New dashboard", { exact: true }),
      ).toBeVisible();
    });

    test("should update breadcrumbs when creating dashboard in different collection", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        '<metabase-browser initial-collection="root" read-only="false" />',
      );

      // verify initial breadcrumb
      await expect(
        frame.getByText("Our analytics", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      await frame.getByText("New dashboard", { exact: true }).click();

      // change collection to save dashboard in
      const dialog = frame.getByRole("dialog");
      await expect(
        dialog.getByText("Which collection should this go in?", {
          exact: true,
        }),
      ).toBeVisible();
      await dialog.getByText("Our analytics", { exact: true }).click();

      const firstCollection = frame.getByText("First collection", {
        exact: true,
      });
      await expect(firstCollection).toBeVisible({ timeout: 20_000 });
      await firstCollection.click();
      await frame.getByText("Select", { exact: true }).click();

      // create the dashboard
      const createDialog = frame.getByRole("dialog");
      await createDialog
        .getByPlaceholder("What is the name of your dashboard?")
        .fill("Test Dashboard");
      await createDialog.getByText("Create", { exact: true }).click();

      // verify breadcrumbs are updated to reflect the selected collection
      await expect(
        frame
          .getByTestId("sdk-breadcrumbs")
          .getByText("First collection", { exact: true }),
      ).toBeVisible({ timeout: 20_000 });
    });

    test("should show New Question button and open data picker when clicked", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        '<metabase-browser initial-collection="root" read-only="false" />',
      );

      const newQuestion = frame.getByText("New question", { exact: true });
      await expect(newQuestion).toBeVisible({ timeout: 40_000 });
      await newQuestion.click();

      // should show data picker
      await expect(
        frame.getByText("Pick your starting data", { exact: true }),
      ).toBeVisible();
    });

    test("should show Save button and save modal with entity picker preselecting the current collection when creating a new question (EMB-1609)", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        '<metabase-browser initial-collection="root" read-only="false" />',
      );

      const newQuestion = frame.getByText("New question", { exact: true });
      await expect(newQuestion).toBeVisible({ timeout: 40_000 });
      await newQuestion.click();

      // select data model
      const orders = frame.getByText("Orders", { exact: true });
      await expect(orders).toBeVisible({ timeout: 40_000 });
      await orders.click();

      // should show Save button
      const save = frame.getByText("Save", { exact: true });
      await expect(save).toBeVisible({ timeout: 40_000 });
      await save.click();

      // save modal should show the collection picker pre-selected to the
      // current collection
      const dialog = frame.getByRole("dialog");
      await expect(
        dialog.getByText("Save new question", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText("Where do you want to save this?", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText("Our analytics", { exact: true }),
      ).toBeVisible();
    });

    test("should hide New Dashboard button when with-new-dashboard is false", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        `
        <metabase-browser
          initial-collection="root"
          read-only="false"
          with-new-dashboard="false"
        />
      `,
      );

      // Positive anchor for the absence check: the read-write toolbar
      // has rendered (with-new-question is still on), so "New dashboard" is
      // absent by configuration rather than by not having mounted yet.
      await expect(
        frame.getByText("New question", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      await expect(
        frame.getByText("New dashboard", { exact: true }),
      ).toHaveCount(0);
    });

    test("should create a dashboard in a new collection", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        '<metabase-browser initial-collection="root" read-only="false" />',
      );

      const newDashboard = frame.getByText("New dashboard", { exact: true });
      await expect(newDashboard).toBeVisible({ timeout: 40_000 });
      await newDashboard.click();

      const createDashboardModal = modal(frame);
      await expect(
        createDashboardModal.getByText("New dashboard", { exact: true }),
      ).toBeVisible();

      // open the collection picker
      await createDashboardModal
        .getByText("Our analytics", { exact: true })
        .click();

      const newCollectionButton = frame.getByRole("button", {
        name: "New collection",
        exact: true,
      });
      await expect(newCollectionButton).toBeEnabled();
      await newCollectionButton.click();

      // `H.modal().contains("header", "Create a new collection").parent()` —
      // the <header> is matched by case-sensitive substring, then its parent
      // (the modal content wrapper carrying both the name input and Create).
      const newCollectionModal = modal(frame)
        .locator("header")
        .filter({ hasText: /Create a new collection/ })
        .first()
        .locator("..");
      await expect(newCollectionModal).toBeVisible({ timeout: 10_000 });
      await newCollectionModal
        .getByPlaceholder("My new collection")
        .fill("Foo Collection");
      await newCollectionModal.getByText("Create", { exact: true }).click();

      await frame.getByText("Select", { exact: true }).click();

      const nameModal = modal(frame);
      await nameModal
        .getByPlaceholder("What is the name of your dashboard?")
        .fill("Foo Bar Dashboard");

      // create new dashboard
      await nameModal.getByText("Create", { exact: true }).click();

      // dashboard is created and shows empty state
      await expect(
        frame.getByText("This dashboard is empty", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      const breadcrumbs = frame.getByTestId("sdk-breadcrumbs");

      // breadcrumbs show the new collection
      await expect(
        breadcrumbs.getByText("Foo Collection", { exact: true }),
      ).toBeVisible();

      // breadcrumbs show the new dashboard
      await expect(
        breadcrumbs.getByText("Foo Bar Dashboard", { exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // dashboard title is visible in header
      await expect(
        frame
          .getByTestId("dashboard-header")
          .getByText("Foo Bar Dashboard", { exact: true }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("should hide New Question button when with-new-question is false", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        `
        <metabase-browser
          initial-collection="root"
          read-only="false"
          with-new-question="false"
        />
      `,
      );

      // Positive anchor for the absence check: the read-write toolbar
      // has rendered (with-new-dashboard is still on).
      await expect(
        frame.getByText("New dashboard", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      await expect(
        frame.getByText("New question", { exact: true }),
      ).toHaveCount(0);
    });

    test("should pass through data-picker-entity-types parameter", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        `
        <metabase-browser
          initial-collection="root"
          read-only="false"
          data-picker-entity-types='["table"]'
        />
      `,
      );

      const newQuestion = frame.getByText("New question", { exact: true });
      await expect(newQuestion).toBeVisible({ timeout: 40_000 });
      await newQuestion.click();

      // should show data picker with limited entity types
      await expect(
        frame.getByText("Pick your starting data", { exact: true }),
      ).toBeVisible();

      // should show Orders table but not Orders model
      const body = embedBody(frame);
      await expect(body).toContainText("Orders");
      // KNOWN-VACUOUS UPSTREAM (see header): the default snapshot ships no
      // models, so this cannot fail. Ported faithfully rather than
      // strengthened; the form change does not alter that.
      await expect(body).not.toContainText("Orders model");
    });
  });

  test.describe("breadcrumb navigation", () => {
    test("should show breadcrumbs when navigating between content", async ({
      page,
      mb,
    }) => {
      const frame = await setupEmbed(
        page,
        mb,
        '<metabase-browser initial-collection="root" />',
      );

      // should show initial breadcrumb
      await expect(
        frame.getByText("Our analytics", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      await frame.getByText("Orders", { exact: true }).first().click();

      // should show breadcrumb for the question
      await expect(embedBody(frame)).toContainText("Orders");

      // Gate on the settled post-navigation state before resolving the
      // breadcrumb anchor: React reuses the Mantine Breadcrumbs anchor nodes
      // while swapping the trail contents, so a locator resolved mid-navigation
      // can be a different crumb by click time (PORTING, batch-8..11).
      await expect(frame.getByTestId("query-visualization-root")).toBeVisible({
        timeout: 20_000,
      });

      await frame.getByText("Our analytics", { exact: true }).click();

      // should be back at collection browser
      await expect(embedBody(frame)).toContainText("Name");
    });
  });
});
