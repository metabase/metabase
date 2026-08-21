import type { FrameLocator, Page } from "@playwright/test";

import { updateCollectionGraph } from "../support/click-behavior";
import { DATA_GROUP } from "../support/collections-core";
import { createCollection } from "../support/dashboard-core";
import { expect, test } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import type { UserName } from "../support/sample-data";
import {
  getNewEmbedConfigurationScript,
  getNewEmbedScriptTag,
  getSimpleEmbedIframe,
  prepareSdkIframeEmbedTest,
  visitCustomHtmlPage,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding/metabase-browser.cy.spec.ts
 *
 * (Group A — the embed.js harness, `support/sdk-iframe.ts`, consumed read-only.
 * No harness change and no companion support module were needed.)
 *
 * Port notes:
 *
 * - `setupEmbed` is spec-local upstream and stays spec-local here, byte-for-byte
 *   the same shape the landed `view-and-curate-content` port uses (Cypress also
 *   has one private copy per spec, so the duplication is the faithful state).
 *   `H.getSimpleEmbedIframeContent()` blocks until the embed iframe exists and
 *   its body is non-empty; the Playwright `getSimpleEmbedIframe` returns a lazy
 *   `FrameLocator` immediately, so `waitForSimpleEmbedIframesToLoad` restores
 *   that gate.
 *
 * - Shared API helpers are imported rather than re-declared:
 *   `updateCollectionGraph` (click-behavior.ts — the same GET-merge-PUT port of
 *   `cy.updateCollectionGraph`), `createCollection` (dashboard-core.ts) and
 *   `DATA_GROUP` (collections-core.ts). Upstream reads `DATA_GROUP_ID` out of
 *   cypress_sample_instance_data by group *name*; `DATA_GROUP` is the
 *   `USER_GROUPS.DATA_GROUP` literal from cypress_data.js. Verified equal on
 *   this snapshot (the group named "data" has id 6).
 *
 * - `findByText`/`findByTestId`/`findByPlaceholderText`/`findByRole(…, {name})`
 *   with string args are EXACT in testing-library (rule 1) → `{ exact: true }`
 *   throughout. `cy.button(n)` is `findByRole("button", { name: n })`.
 *
 * - Absence assertions (`should("not.exist")`) are ported as retrying
 *   `toHaveCount(0)`, which has identical semantics. Each is preceded by a
 *   POSITIVE anchor that is present in BOTH the permitted and forbidden
 *   variants, so the check cannot pass merely because nothing rendered yet:
 *   - test 1: the "no access" error text itself,
 *   - test 2: the collection item "Test Question",
 *   - test 3: the question's own result toolbar (the container that carries
 *     "Save" when the user *can* save) plus the visualization.
 *
 * - `cy.type()` clicks its subject before sending keystrokes (PORTING). The
 *   "Enter an ID" filter value field is ported literally as click → assert
 *   focus → `keyboard.type`, not `fill()`.
 *
 * - `cy.intercept("POST", "/api/dataset/query_metadata").as(...)` +
 *   `cy.wait(...)` becomes a `page.waitForResponse` armed immediately BEFORE
 *   the click that triggers it (rule 2). Upstream's comment explains why the
 *   wait exists: without it the stale `updateQuestion` dispatch races
 *   `loadAndQueryQuestion` and overwrites the reset state.
 *
 * - The `sdk-breadcrumbs` "New question" click is resolved only AFTER
 *   `data-step-cell` reads "Orders" — React reuses the Mantine Breadcrumbs
 *   anchor nodes while swapping the trail, so a locator resolved mid-navigation
 *   can be a different crumb by click time (PORTING, batches 8–11).
 *
 * - No `test.skip` gates: the whole file runs on a bleeding-edge token, which
 *   the spike backend has. 5 tests, 5 executed.
 */

const { ORDERS_ID } = SAMPLE_DATABASE;

const READ = "read";
const NONE = "none";

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

test.describe("scenarios > embedding > sdk iframe embedding > metabase-browser", () => {
  test.describe("collection permissions", () => {
    test("should show an error when initial-collection points to a collection the user has no access to", async ({
      page,
      mb,
    }) => {
      await prepareSdkIframeEmbedTest(page, mb, {
        withToken: "bleeding-edge",
        signOut: false,
      });

      const collection = await createCollection(mb.api, {
        name: "Restricted Collection",
      });

      await updateCollectionGraph(mb.api, {
        [DATA_GROUP]: {
          root: READ,
          [collection.id]: NONE,
        },
      });

      await mb.signIn("nocollection" as UserName);

      const frame = await setupEmbed(
        page,
        mb,
        `
          <metabase-browser
            initial-collection="${collection.id}"
            read-only="false"
          />
        `,
      );

      await expect(
        frame.getByText("You don't have access to this collection", {
          exact: true,
        }),
      ).toBeVisible({ timeout: 40_000 });

      // ANCHOR: the error above is rendered by the same view that would carry
      // the "New question" button, so this absence is taken against a
      // fully-rendered frame.
      await expect(
        frame.getByText("New question", { exact: true }),
      ).toHaveCount(0);
    });

    test("should not show New question button when user has no curate permissions on initial-collection", async ({
      page,
      mb,
    }) => {
      await prepareSdkIframeEmbedTest(page, mb, {
        withToken: "bleeding-edge",
        signOut: false,
      });

      const collection = await createCollection(mb.api, {
        name: "Read Only Collection",
      });

      await updateCollectionGraph(mb.api, {
        [DATA_GROUP]: {
          root: READ,
          [collection.id]: READ,
        },
      });

      await mb.api.createQuestion({
        name: "Test Question",
        query: { "source-table": ORDERS_ID },
        collection_id: collection.id,
      });

      await mb.signIn("nocollection" as UserName);

      const frame = await setupEmbed(
        page,
        mb,
        `
          <metabase-browser
            initial-collection="${collection.id}"
            read-only="false"
          />
        `,
      );

      // User can see the collection contents (they have read access)
      await expect(
        frame.getByText("Test Question", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      // But New question button should be hidden since they can't save
      await expect(
        frame.getByText("New question", { exact: true }),
      ).toHaveCount(0);
    });

    test("should not show Save button when opening an existing question from a read-only collection", async ({
      page,
      mb,
    }) => {
      await prepareSdkIframeEmbedTest(page, mb, {
        withToken: "bleeding-edge",
        signOut: false,
      });

      const collection = await createCollection(mb.api, {
        name: "Read Only Collection",
      });

      await updateCollectionGraph(mb.api, {
        [DATA_GROUP]: {
          root: READ,
          [collection.id]: READ,
        },
      });

      await mb.api.createQuestion({
        name: "Test Question",
        query: { "source-table": ORDERS_ID },
        collection_id: collection.id,
      });

      await mb.signIn("nocollection" as UserName);

      const frame = await setupEmbed(
        page,
        mb,
        `
          <metabase-browser
            initial-collection="${collection.id}"
            read-only="false"
          />
        `,
      );

      const testQuestion = frame.getByText("Test Question", { exact: true });
      await expect(testQuestion).toBeVisible({ timeout: 40_000 });
      await testQuestion.click();

      await expect(frame.getByTestId("visualization-root")).toBeVisible({
        timeout: 40_000,
      });

      await frame
        .getByTestId("interactive-question-result-toolbar")
        .getByText("Filter", { exact: true })
        .click();

      await frame
        .getByTestId("dimension-list-item")
        .getByText("ID", { exact: true })
        .click();

      // `cy.type()` clicks its subject first; ported literally.
      const idInput = frame.getByPlaceholder("Enter an ID", { exact: true });
      await idInput.click();
      await expect(idInput).toBeFocused();
      await page.keyboard.type("1");

      await frame.getByText("Add filter", { exact: true }).click();

      // ANCHOR for the absence below: the question's own result toolbar — the
      // container that renders "Save" for a user who *can* save — is present,
      // and the visualization has re-rendered. Both are present in the
      // read-write variant too, so neither can be what makes "Save" absent.
      await expect(
        frame.getByTestId("interactive-question-result-toolbar"),
      ).toBeVisible({ timeout: 40_000 });
      await expect(frame.getByTestId("visualization-root")).toBeVisible();

      await expect(
        frame.getByRole("button", { name: "Save", exact: true }),
      ).toHaveCount(0);
    });
  });

  test("should reset `New question` editor state when clicking 'New question' breadcrumb after selecting a filter", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      withToken: "bleeding-edge",
      signOut: false,
    });

    const frame = await setupEmbed(
      page,
      mb,
      `
        <metabase-browser
          initial-collection="root"
          read-only="false"
        />
      `,
    );

    const newQuestion = frame.getByText("New question", { exact: true });
    await expect(newQuestion).toBeVisible({ timeout: 40_000 });
    await newQuestion.click();

    await expect(
      frame.getByText("Pick your starting data", { exact: true }),
    ).toBeVisible();

    // Wait for the dataset metadata POST triggered by updateQuestionSdk
    // to complete before clicking the breadcrumb. Without this, the stale
    // updateQuestion dispatch can race with loadAndQueryQuestion and
    // overwrite the reset state.
    const datasetMetadata = waitForDatasetQueryMetadata(page);
    await frame.getByText("Orders", { exact: true }).click();
    await datasetMetadata;

    await expect(frame.getByTestId("data-step-cell")).toHaveText("Orders");

    await frame
      .getByTestId("sdk-breadcrumbs")
      .getByText("New question", { exact: true })
      .click();

    await expect(
      frame.getByText("Pick your starting data", { exact: true }),
    ).toBeVisible();
    await expect(frame.getByTestId("data-step-cell")).not.toHaveText("Orders");
  });

  test("should reset `New question` editor state when clicking 'New question' breadcrumb after Visualize", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      withToken: "bleeding-edge",
      signOut: false,
    });

    const frame = await setupEmbed(
      page,
      mb,
      `
        <metabase-browser
          initial-collection="root"
          read-only="false"
        />
      `,
    );

    const newQuestion = frame.getByText("New question", { exact: true });
    await expect(newQuestion).toBeVisible({ timeout: 40_000 });
    await newQuestion.click();

    await expect(
      frame.getByText("Pick your starting data", { exact: true }),
    ).toBeVisible();

    const datasetMetadata = waitForDatasetQueryMetadata(page);
    await frame.getByText("Orders", { exact: true }).click();
    await datasetMetadata;

    await expect(frame.getByTestId("data-step-cell")).toHaveText("Orders");

    await frame
      .getByRole("button", { name: "Visualize", exact: true })
      .click();
    await expect(frame.getByTestId("visualization-root")).toBeVisible({
      timeout: 40_000,
    });

    await frame
      .getByTestId("sdk-breadcrumbs")
      .getByText("New question", { exact: true })
      .click();

    // Expected: editor reopens fresh, prior table cleared.
    await expect(
      frame.getByText("Pick your starting data", { exact: true }),
    ).toBeVisible();
    await expect(frame.getByTestId("data-step-cell")).not.toHaveText("Orders");
  });
});

/** The `@datasetMetadata` alias: POST /api/dataset/query_metadata. */
function waitForDatasetQueryMetadata(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset/query_metadata",
  );
}
