/**
 * Playwright port of
 * e2e/test/scenarios/sharing/downloads/mid-stream-download-failure.cy.spec.ts
 *
 * Reproduction for the streaming-download corruption bug: when a query fails
 * *after* the download stream has started, the server used to append a JSON
 * error blob and close the connection cleanly. The client couldn't tell, so it
 * saved a corrupt file and reported success. The server now aborts the
 * connection mid-stream and the client surfaces a download error instead.
 *
 * To fail *mid-stream* (not before the response commits) the query has to start
 * streaming and then blow up. This native query previews fine — the query
 * builder caps results at 2000 rows, below the division-by-zero at row 5000 —
 * but the CSV export runs unbounded, streams past the failing row, and aborts.
 *
 * Differences from the Cypress original:
 * - The `@preview` intercept + `cy.wait("@preview")` is dropped: our
 *   `visitQuestion` already registers and awaits the card-query response, so
 *   the preview load is enforced there (PORTING rule 2).
 * - The export is expected to abort mid-stream, so no download event fires and
 *   nothing lands as a file — we assert the download-status toast, exactly as
 *   upstream did, rather than waiting for a `download` event.
 */
import { createNativeQuestion } from "../support/factories";
import { test } from "../support/fixtures";
import {
  FAILS_MID_STREAM_QUERY,
  expectDownloadError,
  triggerDownload,
} from "../support/mid-stream-download-failure";
import { visitQuestion } from "../support/ui";

test.describe("scenarios > sharing > downloads > mid-stream failure", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("surfaces a download error when a query fails after the stream has started", async ({
    page,
    mb,
  }) => {
    const card = await createNativeQuestion(mb.api, {
      name: "Fails mid-stream",
      native: { query: FAILS_MID_STREAM_QUERY },
    });

    // Preview loads because it is capped below the failing row (visitQuestion
    // awaits the card-query response).
    await visitQuestion(page, card.id);

    // Trigger a full CSV export, which streams past the failing row.
    await triggerDownload(page, "csv");

    // The aborted stream is surfaced as a download error, not a silent success.
    await expectDownloadError(page);
  });
});
