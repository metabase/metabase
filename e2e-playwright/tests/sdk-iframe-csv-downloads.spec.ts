import type { FrameLocator, Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import {
  getSimpleEmbedIframe,
  loadSdkIframeEmbedTestPage,
  prepareSdkIframeEmbedTest,
} from "../support/sdk-iframe";
import { popover } from "../support/ui";

/**
 * Port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/sdk-csv-downloads.cy.spec.ts
 *
 * Group A — the `embed.js` customer-page harness in `support/sdk-iframe.ts`,
 * consumed read-only. The three spec-local helpers (`addGroupBy`,
 * `addSummarize`, `setup`) stay spec-local, as upstream has them.
 *
 * Port notes:
 *
 * - `cy.deleteDownloadsFolder()` is dropped: Playwright gives each test its own
 *   temp download directory, so there is nothing to clear.
 *
 * - The CSV assertions are made on the **completed download**, not on an
 *   intercepted-and-replaced response. Upstream had to do the latter
 *   (`req.continue(res => { …; res.send({ statusCode: 200 }) })`) because a
 *   real download wedges the Cypress runner — which also means the file
 *   `cy.verifyDownload` then inspects is upstream's *replacement* body, not the
 *   export. Here the response status/content-type are asserted on the real
 *   response and the line-count / CSV-validity checks run against the file the
 *   browser actually saved. Same three assertions, stronger evidence
 *   (FINDINGS #4).
 *
 * - CSV validity: upstream calls `parse()` from `csv-parse`, which "errors out
 *   if the CSV is invalid". That package is not a dependency of this spike, so
 *   validity is checked structurally instead — every record parses to the same
 *   column count. Recorded as a deliberate substitution rather than a silent
 *   drop.
 *
 * - `cy.findByLabelText("download icon")` is the SDK embed toolbar's button
 *   (not the QB's "Download results"), so it is ported literally rather than
 *   through `support/downloads.ts`, whose helper is `Page`-scoped and drives
 *   the other label.
 *
 * - Each `cy.wait("@alias")` is re-armed immediately before its triggering
 *   action (PORTING rule 2).
 */

const addGroupBy = async (frame: FrameLocator, column: string) => {
  const items = frame
    .getByTestId("step-summarize-0-0")
    .getByTestId("breakout-step")
    .getByTestId("notebook-cell-item");
  // Upstream: `.should("have.length.at.least", 1).last()`.
  await expect
    .poll(() => items.count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1);
  await items.last().click();

  await popover(frame).getByText(column, { exact: true }).click();
};

const addSummarize = async (frame: FrameLocator, metric: string) => {
  await frame.getByText("Pick a function or metric", { exact: true }).click();
  await popover(frame).getByText(metric, { exact: true }).click();
};

/** The harness type `support/sdk-iframe.ts` takes but does not export. */
type EmbedHarness = Parameters<typeof loadSdkIframeEmbedTestPage>[1];

const setup = async (page: Page, mb: EmbedHarness) => {
  await loadSdkIframeEmbedTestPage(page, mb, {
    elements: [
      {
        component: "metabase-question",
        attributes: {
          questionId: "new",
          withDownloads: true,
        },
      },
    ],
  });

  const frame = getSimpleEmbedIframe(page);

  // Pick Orders table from the data picker
  await expect(frame.getByText(/Pick your starting data/)).toBeVisible({
    timeout: 40_000,
  });

  await popover(frame).getByText("Orders", { exact: true }).click();

  await addSummarize(frame, "Count of rows");
  await addGroupBy(frame, "Subtotal");
  await addGroupBy(frame, "Created At");

  const dataset = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
    { timeout: 60_000 },
  );
  await frame.getByRole("button", { name: "Visualize", exact: true }).click();
  await dataset;

  // Switch to Pivot Table visualization
  const pivotDataset = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset/pivot",
    { timeout: 60_000 },
  );
  await frame.getByTestId("chart-type-selector-button").click();
  await frame.getByText("Pivot Table", { exact: true }).click();
  await pivotDataset;

  return frame;
};

test.describe("scenarios > embedding > sdk iframe embedding > csv downloads", () => {
  test.beforeEach(async ({ page, mb }) => {
    await prepareSdkIframeEmbedTest(page, mb, { signOut: true });
  });

  test("should download a non-empty pivoted CSV for an ad-hoc pivot table (metabase#70757)", async ({
    page,
    mb,
  }) => {
    const frame = await setup(page, mb);

    // Before the fix, pivoted downloads returned blank CSVs because
    // visualization_settings (including pivot_table.column_split) were not
    // passed.
    const csvResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset/csv",
      { timeout: 60_000 },
    );
    const downloadEvent = page.waitForEvent("download", { timeout: 60_000 });

    // Click the download button on the toolbar
    const downloadButton = frame.getByLabel("download icon", { exact: true });
    await expect(downloadButton).toBeVisible();
    await downloadButton.click();

    // Select CSV format
    await frame.getByText(".csv", { exact: true }).click();

    // Ensure "Keep the data pivoted" is checked
    const keepPivoted = frame.getByTestId("keep-data-pivoted");
    if (!(await keepPivoted.isChecked())) {
      await keepPivoted.click();
    }

    // Click the download button
    await frame.getByTestId("download-results-button").click();

    const [response, download] = await Promise.all([
      csvResponse,
      downloadEvent,
    ]);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");

    const fs = await import("fs");
    const csvContent = fs.readFileSync(await download.path(), "utf8");
    const lines = csvContent.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);

    // Stands in for upstream's `parse(csvContent)` — every record has the same
    // column count, which is what an invalid CSV would break.
    const columnCounts = new Set(lines.map((line) => splitCsvRow(line).length));
    expect(columnCounts.size).toBe(1);

    // cy.verifyDownload("query_result_", { contains: true })
    expect(download.suggestedFilename()).toContain("query_result_");
  });
});

/** Minimal RFC4180 record splitter — enough to count a row's fields with
 * quoted, comma-containing values handled correctly. */
function splitCsvRow(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}
