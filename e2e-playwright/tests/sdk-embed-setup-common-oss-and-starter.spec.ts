import { ORDERS_COUNT_QUESTION_ID } from "../support/collections-reproductions";
import { expect, test } from "../support/fixtures";
import { visitNewEmbedPage } from "../support/sdk-embed-setup";
import { installSnowplowCapture } from "../support/search-snowplow";
import { visitQuestion } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/common-oss-and-starter.cy.spec.ts
 *
 * Group B (the embed SETUP wizard). `support/sdk-embed-setup.ts` is consumed
 * read-only; no companion support module — every helper already exists.
 *
 * TIER (the `-oss-and-starter` half of the pair whose `-ee` half is
 * `tests/sdk-embed-setup-common-ee.spec.ts`).
 * This is an ASSERTION gate, not a describe gate, exactly like the
 * guest-embed pair. The `@OSS` tag on the first describe means "runs on an OSS
 * build"; the only mechanical difference between the two describes is whether
 * `activateToken("starter")` is called. Measured on this jar:
 *
 *   | tier              | enabled token-features                                          |
 *   | ----------------- | --------------------------------------------------------------- |
 *   | no token (OSS)    | (none)                                                          |
 *   | starter           | config_text_file, hosting, offer-metabase-ai-managed, support-users |
 *
 * Neither set contains `embedding_simple`, which is the feature both tests
 * turn on. So both describes genuinely reproduce the upstream feature set on
 * this EE jar and NOTHING is `test.skip`ped — all 4 tests execute. Skipping
 * by reflex would delete the only assertion that distinguishes this file from
 * `common-ee`: that file asserts the SSO radio is **enabled** where this one
 * asserts it is **disabled**.
 *
 * The gate is REAL and was measured by inversion — adding
 * `activateToken("pro-self-hosted")` to the beforeEach flips the SSO radio to
 * enabled and fails the second test in both describes. See findings.
 *
 * The OSS describe asserts its precondition (no enabled token features)
 * rather than assuming it, per PORTING.md: "activateToken didn't throw" — and
 * by the same token "we didn't call activateToken" — is not evidence.
 * `mb.restore()` wipes `premium-embedding-token`, and the assertion proves it.
 *
 * Port notes:
 * - `H.mockEmbedJsToDevServer()` dropped (see sdk-embed-setup.ts header): the
 *   wizard preview imports the embed runtime directly and never fetches
 *   `embed.js`.
 * - `cy.intercept("GET", "/api/dashboard/**").as("dashboard")` in the
 *   `beforeEach` is never awaited by either test (both pass
 *   `waitForResource: false`, which is precisely the "don't wait for the
 *   dashboard" switch). Dropped per rule 2 — arming a `waitForResponse` nobody
 *   awaits would reject unhandled.
 * - SNOWPLOW is not the subject: no event assertions and no
 *   `expectNoBadSnowplowEvents`. `H.enableTracking()` is still ported as the
 *   `anon-tracking-enabled` setting so backend state matches upstream, and
 *   `installSnowplowCapture` is installed ONLY to stop that from firing real
 *   analytics at Metabase's production collector on a clean jar boot (same
 *   reasoning as `common-ee`). Nothing asserts on it.
 * - `cy.findByLabelText(...)` is an EXACT match (rule 1) and is page-scoped
 *   upstream, not sidebar-scoped — kept page-scoped here.
 */

const SSO_LABEL = "Metabase account (SSO)";
const GUEST_LABEL = "Guest";

for (const [tierName, token] of [
  ["OSS", null],
  ["Starter", "starter"],
] as const) {
  test.describe(`scenarios > embedding > sdk iframe embed setup > common (${tierName})`, () => {
    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      if (token) {
        await mb.api.activateToken(token);
      }

      // The tier precondition, asserted rather than assumed. `activateToken`
      // PUTs with `failOnStatusCode: false`, so "it didn't throw" proves
      // nothing either way.
      const properties = (await (
        await mb.api.get("/api/session/properties")
      ).json()) as { "token-features"?: Record<string, unknown> };
      const enabled = Object.entries(properties["token-features"] ?? {})
        .filter(([, value]) => value === true)
        .map(([name]) => name);

      if (token === null) {
        expect(enabled, "no token features active (@OSS)").toEqual([]);
      } else {
        expect(enabled.length, `${tierName} token took`).toBeGreaterThan(0);
      }
      // The feature both tests depend on being ABSENT, in both tiers.
      expect(enabled, "embedding_simple must be absent").not.toContain(
        "embedding_simple",
      );

      // Port of H.enableTracking().
      await mb.api.updateSetting("anon-tracking-enabled", true);

      await installSnowplowCapture(page, mb.baseUrl);
    });

    test("allows to select the `guest` item even when static embedding setting is disabled", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("enable-embedding-static", false);

      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);

      await visitNewEmbedPage(page, { waitForResource: false });

      await expect(page.getByLabel(GUEST_LABEL, { exact: true })).toBeEnabled();
    });

    test("does not allow to select the `Metabase Account`, when token feature is missing (oss)", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("enable-embedding-simple", false);

      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);

      await visitNewEmbedPage(page, { waitForResource: false });

      await expect(page.getByLabel(SSO_LABEL, { exact: true })).toBeDisabled();
    });
  });
}
