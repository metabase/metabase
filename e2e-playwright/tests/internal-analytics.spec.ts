/**
 * Playwright port of e2e/test/scenarios/admin/internal-analytics.cy.spec.ts
 */
import { test, expect } from "../support/fixtures";

test.describe("internal analytics", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should POST batched internal analytics events to the backend", async ({
    page,
  }) => {
    await page.goto("/");

    const analyticsFlush = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/analytics/internal",
    );

    await page.evaluate(() => {
      // Send more than flush-buffer-size (50) events to trigger an immediate
      // flush. See metabase.analytics.impl/flush-buffer-size.
      const analytics = (window as any).__internalAnalytics;
      for (let i = 0; i < 51; i++) {
        analytics.inc("e2e-test/counter", { test: "true" }, 1);
      }
    });

    const response = await analyticsFlush;
    expect(response.status()).toBe(204);
    const body = response.request().postDataJSON();
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events[0]).toHaveProperty("op");
    expect(body.events[0]).toHaveProperty("metric");
  });
});
