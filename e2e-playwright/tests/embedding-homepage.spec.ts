/**
 * Playwright port of e2e/test/scenarios/onboarding/embedding-homepage.cy.spec.ts
 *
 * - Snowplow helpers are no-op stubs (no snowplow-micro container in the
 *   spike harness), same as onboarding-checklist.spec.ts.
 * - With the snowplow asserts inert, each test anchors on the real product
 *   effect of the tracked action instead: the example-dashboard button
 *   navigates to /dashboard/1 (the mocked example-dashboard-id), and the
 *   dismissal PUTs embedding-homepage="dismissed-done" — the same
 *   dismiss_reason the Cypress spec could only see via the snowplow payload.
 * - The Cypress spec mocked three session properties in one intercept;
 *   mockSessionProperties in onboarding-extras.ts is the multi-property
 *   variant of admin-extras' mockSessionProperty.
 */
import { test, expect } from "../support/fixtures";
import { mockSessionProperties } from "../support/onboarding-extras";
import { main } from "../support/sharing";
import { popover } from "../support/ui";

// TODO: no snowplow-micro container in the spike harness.
const resetSnowplow = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

test.describe("scenarios > embedding-homepage > snowplow events", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await resetSnowplow();

    await mb.signInAsAdmin();
    await mockSessionProperties(page, {
      "embedding-homepage": "visible",
      "example-dashboard-id": 1,
      "setup-license-active-at-setup": true,
    });
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test("opening the example dashboard from the button should send the 'embedding_homepage_example_dashboard_click' event", async ({
    page,
  }) => {
    await page.goto("/");

    await main(page)
      .getByText("Embed an example dashboard", { exact: true })
      .click();

    // The mocked example-dashboard-id points at dashboard 1; landing there
    // (even on a permission error page) is the observable effect.
    await page.waitForURL((url) => url.pathname === "/dashboard/1");

    await expectUnstructuredSnowplowEvent({
      event: "embedding_homepage_example_dashboard_click",
    });
  });

  test("dismissing the homepage should send the 'embedding_homepage_dismissed' event", async ({
    page,
  }) => {
    await page.goto("/");

    await main(page).getByText("Hide these", { exact: true }).click();

    const dismissPut = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname ===
          "/api/setting/embedding-homepage",
    );
    await popover(page)
      .getByText("Embedding done, all good", { exact: true })
      .click();

    // The dismiss reason the Cypress spec read from the snowplow event is
    // also what the frontend persists — assert that for real.
    const response = await dismissPut;
    expect(response.request().postDataJSON()).toEqual({
      value: "dismissed-done",
    });

    await expectUnstructuredSnowplowEvent({
      event: "embedding_homepage_dismissed",
      dismiss_reason: "dismissed-done",
    });
  });
});
