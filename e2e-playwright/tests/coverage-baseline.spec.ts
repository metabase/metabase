/**
 * Playwright port of e2e/test/scenarios/coverage-baseline.cy.spec.js
 *
 * WHAT THIS FILE ACTUALLY IS — read before treating it as coverage.
 * ----------------------------------------------------------------
 * The Cypress original is **not a product spec**. It is instrumentation
 * scaffolding for the selective-e2e coverage pipeline:
 *
 * - `.github/scripts/e2e-spec-globs.mjs` exports it as `BASELINE_SPEC` and
 *   `listSpecFiles()` explicitly **ignores** it, so it is excluded from the
 *   spec "universe" the test planner selects from and from the manifest
 *   backfill reconciliation. Its own comment: "This is the nightly-only
 *   baseline helper that runs in the instrumented pass to capture boot-time
 *   coverage. It is not a product spec."
 * - `e2e/support/config.js`'s `after:spec` hook (under
 *   `INSTRUMENT_COVERAGE=true`) writes per-spec raw coverage to
 *   `e2e/coverage-manifest-raw`, and
 *   `e2e/coverage/build-coverage-manifest.mjs` subtracts THIS spec's function
 *   counters from every other spec's to strip eager-loaded boot modules.
 *
 * So its value is entirely in the coverage counters its run produces, not in
 * its assertions. The Playwright harness has no coverage instrumentation and no
 * `after:spec` hook feeding that manifest, so **this port does not reproduce
 * the original's function.** It is ported anyway, faithfully and 1:1, because
 * the body is a real (if minimal) sign-in-and-load-home smoke test that costs
 * ~1s and keeps the spec inventory honest — but it must NOT be counted as
 * migrating the coverage pipeline. If the Cypress coverage manifest survives
 * the migration, the Cypress original has to survive with it.
 *
 * The body is ported literally: restore → sign in as admin → visit `/` →
 * assert the app bar and the home page rendered. No intercepts, no waits, no
 * snowplow.
 */
import { expect, test } from "../support/fixtures";

test.describe("coverage baseline", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("signs in and loads the home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("app-bar")).toBeVisible();
    await expect(page.getByTestId("home-page")).toBeVisible();
  });
});
