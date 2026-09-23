/**
 * Playwright port of e2e/test/scenarios/embedding/embedding-smoketests.cy.spec.js
 *
 * Porting notes:
 * - Upstream is tagged @OSS (runs on both OSS and EE instances, both without
 *   a token). The spike backend is an EE build without a token, which is one
 *   of the two upstream legs (and yields the same source_plan=oss upsell
 *   url), so the assertions are ported unchanged.
 * - Cypress's AUT is architecturally iframed, so /embed/* pages in Cypress
 *   render in framed mode (bordered by default, action buttons hidden).
 *   H.visitIframe is ported via the iframe harness in support/embedding.ts
 *   to preserve that context; /embed/* documents are served frame-embeddable
 *   (no X-Frame-Options), so no header stripping is needed.
 * - The "@currentlyEmbeddedObject" intercept in the dashboard-question test
 *   is registered upstream but never awaited — dropped here.
 * - Upstream passes `database_id: SAMPLE_DATABASE.id` to H.createQuestion,
 *   which silently ignores it (the helper only reads `database`, defaulting
 *   to SAMPLE_DB_ID) — the dead parameter is not ported.
 * - `cy.findByDisplayValue(token)` (document-wide) is ported scoped to the
 *   embedding-secret-key setting's textbox, which is the input it matched.
 */
import type { Page } from "@playwright/test";

import { isOssBackend } from "../support/admin";
import type { MetabaseApi } from "../support/api";
import { modal } from "../support/dashboard";
import { icon } from "../support/dashboard-cards";
import {
  METABASE_SECRET_KEY,
  createQuestion,
  currentIframeSrc,
  embedModalContent,
  embedModalEnableEmbedding,
  openEmbedJsModal,
  openLegacyStaticEmbeddingModal,
  visitIframe,
  visitStaticEmbedUrl,
} from "../support/embedding";
import { test, expect } from "../support/fixtures";
import { viewFooter } from "../support/notebook";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { sharingMenuButton } from "../support/sharing";
import { visitDashboard, visitQuestion } from "../support/ui";

const standalonePath = "/admin/embedding/guest";

// These tests will run on both OSS and EE instances. Both without a token!
test.describe("scenarios > embedding > smoke tests", () => {
  // Upstream describe is tagged @OSS — it runs only against the OSS jar
  // (upsell links/copy assume no EE artifact). Skip on EE backends the same
  // way admin-authentication gates its OSS test.
  test.beforeEach(async ({ mb }) => {
    test.skip(
      !(await isOssBackend(mb.api)),
      "@OSS-tagged upstream: needs an OSS backend",
    );
  });

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.updateSetting("show-sdk-embed-terms", false);
  });

  test("should not offer to share or embed models (metabase#20815)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });

    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await page.goto(`/model/${ORDERS_QUESTION_ID}`);
    await dataset;

    await expect(sharingMenuButton(page)).toHaveCount(0);

    await expect(icon(viewFooter(page), "download")).toBeVisible();
  });

  test.describe("embedding disabled", () => {
    test.beforeEach(async ({ mb }) => {
      // We enable embedding by default in the default snapshot that all tests
      // are using. That's why we need to disable it here.
      await resetEmbedding(mb.api);
    });

    test("should show the sdk upsell link in oss", async ({ page }) => {
      await page.goto("/admin/embedding");

      await expect(
        mainPage(page).getByRole("link", { name: "Upgrade", exact: true }),
      ).toHaveAttribute(
        "href",
        "https://www.metabase.com/upgrade?utm_source=product&utm_medium=upsell&utm_content=embedding-page&source_plan=oss&utm_users=10&utm_campaign=embedding-methods",
      );
    });

    test("should not let you use non-guest auth methods", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);

      await openEmbedJsModal(page);
      await embedModalEnableEmbedding(page);

      const content = embedModalContent(page);
      await expect(content.getByLabel("Guest", { exact: true })).toBeChecked();
      await expect(
        content.getByLabel("Metabase account (SSO)", { exact: true }),
      ).toBeDisabled();
    });
  });

  test.describe("embedding enabled", () => {
    const ids = {
      question: ORDERS_QUESTION_ID,
      dashboard: ORDERS_DASHBOARD_ID,
    };
    (["question", "dashboard"] as const).forEach((object) => {
      test(`should be able to publish/embed and then unpublish a ${object} without filters`, async ({
        page,
        mb,
      }) => {
        await mb.api.updateSetting("enable-embedding-static", true);
        const embeddableObject = object === "question" ? "card" : "dashboard";
        const objectName =
          object === "question" ? "Orders" : "Orders in a dashboard";

        await visitAndEnableSharing(page, mb, object);

        const staticModal = modal(page);
        await staticModal
          .getByRole("tab", { name: "Look and Feel", exact: true })
          .click();

        await expect(
          staticModal.getByText("Theme", { exact: true }),
        ).toBeVisible();
        // Label-only presence checks upstream (the switches' inputs are
        // visually hidden, so assert attachment, not visibility).
        await expect(
          staticModal.getByLabel(
            object === "dashboard" ? "Dashboard title" : "Question title",
            { exact: true },
          ),
        ).toBeAttached();
        await expect(
          staticModal.getByLabel(
            object === "dashboard" ? "Dashboard border" : "Question border",
            { exact: true },
          ),
        ).toBeAttached();
        await expect(
          staticModal.getByText("You can change the font with a paid plan.", {
            exact: true,
          }),
        ).toBeVisible();

        await expect(
          staticModal.getByText(
            object === "dashboard"
              ? "Results (csv, xlsx, json, png)"
              : "Download (csv, xlsx, json, png)",
            { exact: true },
          ),
        ).toHaveCount(0);
        await expect(
          staticModal.getByRole("button", {
            name: "Export as PDF",
            exact: true,
          }),
        ).toHaveCount(0);

        await staticModal
          .getByRole("tab", { name: "Parameters", exact: true })
          .click();

        await expect(
          staticModal.getByText(
            `This ${object} doesn't have any parameters to configure yet.`,
            { exact: true },
          ),
        ).toBeVisible();

        await expect(
          staticModal.getByText(
            `You will need to publish this ${object} before you can embed it in another application.`,
            { exact: true },
          ),
        ).toBeVisible();

        const published = waitForEmbedObjectPut(
          page,
          embeddableObject,
          ids[object],
        );
        await staticModal
          .getByRole("button", { name: "Publish", exact: true })
          .click();
        await published;

        const { frame } = await visitIframe(page, mb);

        const embedFrame = frame.getByTestId("embed-frame");
        await expect(
          embedFrame.getByRole("heading", { name: objectName, exact: true }),
        ).toBeVisible();
        await expect(
          embedFrame.getByRole("gridcell").filter({ hasText: "37.65" }).first(),
        ).toBeVisible();

        const poweredBy = frame
          .getByRole("contentinfo")
          .getByRole("link", { name: "Powered by Metabase", exact: true });
        await expect(poweredBy).toHaveAttribute(
          "href",
          /https:\/\/www\.metabase\.com\?/,
        );

        // Make sure the object shows up in the standalone embeds page
        await mb.signInAsAdmin();
        const embeddableList = waitForEmbeddableList(page, embeddableObject);
        await page.goto(standalonePath);
        await embeddableList;

        const sectionTestId = {
          dashboard: "-embedded-dashboards-setting",
          question: "-embedded-questions-setting",
        }[object];

        const rows = page.getByTestId(sectionTestId).locator("tbody tr");
        await expect(rows).toHaveCount(1);
        await expect(rows).toContainText(objectName);

        // Unpublish the object
        await visitAndEnableSharing(page, mb, object, false);

        const republishedModal = modal(page);
        await expect(
          republishedModal.getByText(
            `This ${object} is published and ready to be embedded.`,
            { exact: true },
          ),
        ).toBeVisible();
        const unpublished = waitForEmbedObjectPut(
          page,
          embeddableObject,
          ids[object],
        );
        await republishedModal
          .getByRole("button", { name: "Unpublish", exact: true })
          .click();
        await unpublished;

        await republishedModal
          .getByRole("tab", { name: "Parameters", exact: true })
          .click();

        const { frame: unpublishedFrame } = await visitIframe(page, mb);

        await expect(
          unpublishedFrame
            .getByTestId("embed-frame")
            .getByText("Embedding is not enabled for this object.", {
              exact: true,
            }),
        ).toBeVisible();

        await mb.signInAsAdmin();
        const embeddableListAfter = waitForEmbeddableList(
          page,
          embeddableObject,
        );
        await page.goto(standalonePath);
        await embeddableListAfter;

        await expect(
          mainPage(page).getByText(
            /No (questions|dashboards) have been embedded yet./,
          ),
        ).toHaveCount(2);
      });
    });

    test("should be able to publish/embed a dashboard with a dashboard question saved within it", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, {
        name: "Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
        enable_embedding: true,
      });

      await mb.api.updateSetting("enable-embedding-static", true);

      await visitAndEnableSharing(page, mb, "dashboard");

      const staticModal = modal(page);
      await staticModal
        .getByRole("tab", { name: "Look and Feel", exact: true })
        .click();
      const published = waitForEmbedObjectPut(
        page,
        "dashboard",
        ORDERS_DASHBOARD_ID,
      );
      await staticModal
        .getByRole("button", { name: "Publish", exact: true })
        .click();
      await published;

      const { frame, url } = await visitIframe(page, mb);
      expect(url).toContain("/embed/dashboard/");

      const embedFrame = frame.getByTestId("embed-frame");
      await expect(
        embedFrame.getByRole("heading", {
          name: "Orders in a dashboard",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        embedFrame.getByText("Total Orders", { exact: true }),
      ).toBeVisible();
      await expect(
        embedFrame.getByText("18,760", { exact: true }),
      ).toBeVisible();
    });

    test("should regenerate embedding token and invalidate previous embed url", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("enable-embedding-static", true);

      await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
        enable_embedding: true,
      });
      await visitAndEnableSharing(page, mb, "question", false);

      const staticModal = modal(page);
      await staticModal
        .getByRole("tab", { name: "Parameters", exact: true })
        .click();
      await staticModal.getByText("Preview", { exact: true }).click();

      const embedUrl = await currentIframeSrc(page, mb.baseUrl);

      await mb.signOut();
      const frame = await visitStaticEmbedUrl(page, {
        url: embedUrl,
        baseUrl: mb.baseUrl,
      });

      await expect(
        frame.getByTestId("embed-frame").getByText("37.65").first(),
      ).toBeVisible();

      await mb.signInAsAdmin();
      await page.goto(standalonePath);

      const secretKeyInput = page
        .getByTestId("embedding-secret-key-setting")
        .getByRole("textbox");
      await expect(secretKeyInput).toHaveValue(METABASE_SECRET_KEY);

      await page
        .getByRole("button", { name: "Regenerate key", exact: true })
        .click();

      const confirmModal = modal(page);
      const regenerated = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/util/random_token",
      );
      await expect(
        confirmModal.getByRole("heading", {
          name: "Regenerate embedding key?",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        confirmModal.getByText(
          "This will cause existing embeds to stop working until they are updated with the new key.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        confirmModal.getByText("Are you sure you want to do this?", {
          exact: true,
        }),
      ).toBeVisible();
      await confirmModal.getByRole("button", { name: "Yes", exact: true }).click();

      const { token } = (await (await regenerated).json()) as {
        token: string;
      };
      expect(token).toHaveLength(64);
      expect(token).not.toBe(METABASE_SECRET_KEY);

      await expect(secretKeyInput).toHaveValue(token);

      // Visit the embedding url generated with the old token
      const staleFrame = await visitStaticEmbedUrl(page, {
        url: embedUrl,
        baseUrl: mb.baseUrl,
      });
      await expect(
        staleFrame
          .getByTestId("embed-frame")
          .getByText("Message seems corrupt or manipulated", { exact: true }),
      ).toBeVisible();
    });
  });
});

async function resetEmbedding(api: MetabaseApi) {
  await api.updateSetting("enable-embedding-static", false);
  await api.updateSetting("embedding-secret-key", null);
}

async function visitAndEnableSharing(
  page: Page,
  mb: { api: MetabaseApi },
  object: "question" | "dashboard",
  unpublishBeforeOpen = true,
) {
  if (object === "question") {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "question",
      resourceId: ORDERS_QUESTION_ID,
      unpublishBeforeOpen,
    });
  } else {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "dashboard",
      resourceId: ORDERS_DASHBOARD_ID,
      unpublishBeforeOpen,
    });
  }
}

function mainPage(page: Page) {
  return page.getByTestId("admin-layout-content");
}

function waitForEmbedObjectPut(
  page: Page,
  apiPath: "card" | "dashboard",
  id: number,
) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/${apiPath}/${id}`,
  );
}

function waitForEmbeddableList(page: Page, apiPath: "card" | "dashboard") {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/${apiPath}/embeddable`,
  );
}
