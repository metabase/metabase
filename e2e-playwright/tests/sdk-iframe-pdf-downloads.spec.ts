import type { FrameLocator, Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  type EmbedTestPageOptions,
  loadSdkIframeEmbedTestPage,
  prepareSdkIframeEmbedTest,
} from "../support/sdk-iframe";
import { assertOrdersDashboardVisible } from "../support/sdk-iframe-embedding";
import {
  type SnowplowCapture,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";

/**
 * Port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/sdk-pdf-downloads.cy.spec.ts
 *
 * Group A — `support/sdk-iframe.ts` and `support/sdk-iframe-embedding.ts`
 * (`assertOrdersDashboardVisible`, which is verbatim upstream's "check that the
 * dashboard loaded fine" block) are consumed read-only. No companion module.
 *
 * Port notes:
 *
 * - **Snowplow is the subject of test 1**, not incidental to it ("with
 *   analytics tracking"), so PORTING rule 6's no-op stub would port it as a
 *   no-op. The events are captured at the browser boundary with
 *   `installSnowplowCapture` instead. It must be installed before the first
 *   navigation; `prepareSdkIframeEmbedTest` performs none (it is API calls plus
 *   `page.route`), so the outer `beforeEach` ordering matches upstream's
 *   `H.resetSnowplow()`. Nothing here routes `/api/session/properties`
 *   afterwards, which would silently defeat the capture.
 *
 *   The tracked event fires from inside the *embed iframe*, not the customer
 *   page. Both the `addInitScript` and the two `page.route` handlers apply to
 *   every frame in the page, so the capture reaches it — verified by
 *   inverting the input (see findings).
 *
 * - `H.expectNoBadSnowplowEvents` is the structural stand-in documented in
 *   `support/search-snowplow.ts` (no snowplow-micro, so no Iglu schema
 *   validation). Same recorded gap as the search-snowplow port.
 *
 * - `cy.deleteDownloadsFolder()` is dropped: Playwright gives each test its own
 *   temp download directory.
 *
 * - `cy.verifyDownload("Orders in a dashboard.pdf")` → the download is allowed
 *   to complete and `suggestedFilename()` is asserted. `download.url()` would
 *   be a `blob:` URL here (the FE renders the PDF client-side), so a URL
 *   assertion could never pass.
 *
 * - `cy.wait("@getDashCardQuery")` (`POST /api/dashboard/**​/query`) is armed
 *   before the page load and awaited after it (PORTING rule 2).
 *
 * - Test 2's `should("not.exist")` → retrying `toHaveCount(0)`. `setup()`
 *   already anchors it on the dashboard having fully rendered (title, card
 *   title, and 2000 rows), so the absence cannot be satisfied by "nothing has
 *   painted yet".
 */

type EmbedHarness = Parameters<typeof loadSdkIframeEmbedTestPage>[1];

const setup = async (
  page: Page,
  mb: EmbedHarness,
  options: Partial<EmbedTestPageOptions>,
): Promise<FrameLocator> => {
  const dashCardQuery = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/dashboard\/.+\/query$/.test(new URL(response.url()).pathname),
    { timeout: 60_000 },
  );

  const frame = await loadSdkIframeEmbedTestPage(page, mb, {
    elements: [
      {
        component: "metabase-dashboard",
        attributes: {
          dashboardId: ORDERS_DASHBOARD_ID,
          withDownloads: true,
        },
      },
    ],
    ...options,
  });

  await dashCardQuery;

  // Check that the dashboard loaded fine
  await assertOrdersDashboardVisible(frame);

  return frame;
};

test.describe("scenarios > embedding > sdk iframe embedding > pdf downloads", () => {
  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    capture = await installSnowplowCapture(page, mb.baseUrl);
  });

  test.afterEach(async () => {
    expectNoBadSnowplowEvents(capture);
  });

  test.describe("Dashboard PDF downloads", () => {
    test.beforeEach(async ({ page, mb }) => {
      await prepareSdkIframeEmbedTest(page, mb, { signOut: true });
    });

    test("should download dashboard as PDF with analytics tracking", async ({
      page,
      mb,
    }) => {
      const frame = await setup(page, mb, {
        metabaseConfig: {
          theme: {
            components: {
              dashboard: {
                backgroundColor: "transparent",
              },
            },
          },
        },
      });

      await expect(
        frame.getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();

      const downloadButton = frame.getByLabel("Download as PDF", {
        exact: true,
      });
      await expect(downloadButton).toBeVisible();

      const downloadEvent = page.waitForEvent("download", { timeout: 60_000 });
      await downloadButton.click();

      // Verify PDF file download
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toBe("Orders in a dashboard.pdf");

      // Verify analytics tracking
      await expectUnstructuredSnowplowEvent(capture, {
        dashboard_accessed_via: "sdk-embed",
        event: "dashboard_pdf_exported",
      });
    });

    test("should hide PDF download button when with-downloads is false", async ({
      page,
      mb,
    }) => {
      const frame = await setup(page, mb, {
        elements: [
          {
            component: "metabase-dashboard",
            attributes: {
              dashboardId: ORDERS_DASHBOARD_ID,
              withDownloads: false,
            },
          },
        ],
      });

      await expect(
        frame.getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();

      await expect(
        frame.getByLabel("Download as PDF", { exact: true }),
      ).toHaveCount(0);
    });
  });
});
