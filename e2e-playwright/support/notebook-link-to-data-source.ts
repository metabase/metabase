/**
 * Helpers for the notebook "link to data source" port
 * (e2e/test/scenarios/question/notebook-link-to-data-source.cy.spec.ts).
 *
 * New module so the shared support files stay untouched — everything else the
 * spec needs is imported read-only from the consolidated modules.
 */
import type { Locator, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Port of METAKEY (frontend/src/metabase/utils/browser.ts): "⌘" on macOS, else
 * "Ctrl". The FE derives it from navigator.platform, which Chromium reports as
 * the host OS (no device emulation), so process.platform matches the browser's
 * verdict on both the mac dev box and the Linux CI runner.
 */
export const METAKEY = process.platform === "darwin" ? "⌘" : "Ctrl";

/**
 * USERS.sandboxed.login_attributes.attr_uid === "1" (cypress_data.js). The port's
 * support/sample-data.ts USERS map only carries email/password, so the value is
 * pinned here.
 */
export const SANDBOXED_ATTR_UID = 1;

/**
 * Port of H.click(H.holdMetaKey): ctrl/cmd-click. "ControlOrMeta" maps to Meta on
 * macOS and Control everywhere else — exactly the platform split holdMetaKey
 * ({ metaKey } vs { ctrlKey }) encodes.
 */
export function metaClick(locator: Locator): Promise<void> {
  return locator.click({ modifiers: ["ControlOrMeta"] });
}

/**
 * Port of the beforeEach window.open stub. The app opens a data source in a new
 * tab via window.open(url, "_blank") (Urls.openInNewTab); Cypress stubs
 * window.open to navigate the current page instead so the assertions can inspect
 * the result. Without this, a meta-click would spawn a Playwright popup page.
 * addInitScript runs before every navigation, so register it before the test's
 * first goto.
 */
export async function openDataSourceInSameTab(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.open = (url?: string | URL): Window | null => {
      if (url != null) {
        window.location.assign(String(url));
      }
      return null;
    };
  });
}

type DatasetBody = {
  data: {
    is_sandboxed: boolean;
    cols: { id: number }[];
    rows: unknown[][];
  };
};

/**
 * Port of H.assertDatasetReqIsSandboxed (e2e-permissions-helpers.js): the
 * captured dataset/card-query response reports is_sandboxed, and (optionally)
 * every value in the given column equals columnAssertion.
 */
export async function assertDatasetReqIsSandboxed(
  response: Response,
  {
    columnId,
    columnAssertion,
  }: { columnId?: number; columnAssertion?: number } = {},
): Promise<void> {
  const { data } = (await response.json()) as DatasetBody;
  expect(data.is_sandboxed).toBe(true);

  if (columnId != null && columnAssertion != null) {
    const colIndex = data.cols.findIndex((col) => col.id === columnId);
    expect(colIndex).toBeGreaterThanOrEqual(0);
    const values = data.rows.map((row) => row[colIndex]);
    // DECLARED STRENGTHENING (security surface). Upstream is
    // `expect(values.every(assertionFn)).to.equal(true)` with no non-empty
    // guard — and `[].every(...)` is `true`, so a sandboxed query returning
    // ZERO rows satisfies "every value equals X" while proving nothing. That
    // is the same shape as FINDINGS #202, and it matters more here because
    // this helper is the primary evidence in the sandboxing specs.
    //
    // Passing columnId + columnAssertion means "every value in this column is
    // X", which is only meaningful if there are values. A test that expects an
    // empty result asserts on is_sandboxed or a row count instead, and does not
    // reach this branch.
    expect(
      values.length,
      "sandboxed query returned no rows, so the per-value assertion below " +
        "would pass vacuously",
    ).toBeGreaterThan(0);
    expect(values.every((value) => value === columnAssertion)).toBe(true);
  }
}
