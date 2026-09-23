/**
 * Playwright port of
 * e2e/test/scenarios/sharing/public-dashboard.cy.spec.js
 * ("scenarios > public > dashboard" and its "[EE]" sibling describe).
 *
 * Porting notes:
 * - `prepareDashboard` (enable public sharing + tabbed native-question dashboard
 *   + filter-to-card mapping) and the anchor spy live in
 *   support/public-dashboard.ts.
 * - `H.visitPublicDashboard(id, opts)` mints the public link and visits the page
 *   signed out (support/sharing.ts). The USERS-loop test instead creates the
 *   link as admin (createPublicLink) then swaps the browser session before
 *   visiting, mirroring the Cypress `setUser()` variants.
 * - `cy.signIn("none")` → signInWithCachedSession(context, "none") (that user is
 *   outside the fixture's UserName union but is in the snapshot login cache).
 * - Retried `cy.url().should("include", ...)` → `expect.poll(() => page.url())`.
 * - Rule 3: `H.filterWidget().click()` takes the first widget → `.first()`.
 * - The window-title / locale / iframe-background / session-properties tests are
 *   EE-gated (`activateToken("pro-self-hosted")`).
 */
import { test, expect } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { createDashboardWithQuestions } from "../support/factories";
import { visitPublicDashboard } from "../support/question-saved";
import { createPublicLink } from "../support/public-sharing";
import {
  openNewPublicLinkDropdown,
  signInWithCachedSession,
} from "../support/sharing";
import { visitDashboard, goToTab, popover } from "../support/ui";
import { filterWidget, getDashboardCard } from "../support/dashboard";
import { applyFilterToast, applyFilterButton } from "../support/dashboard-filters-auto-apply";
import {
  assertDashboardFixedWidth,
  assertDashboardFullWidth,
} from "../support/dashboard-core";
import { dashboardParametersContainer } from "../support/dashboard-parameters";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  COUNT_ALL,
  COUNT_DOOHICKEY,
  PUBLIC_DASHBOARD_REGEX,
  TAB_2,
  TEXT_FILTER,
  UNUSED_FILTER,
  getCapturedAnchor,
  prepareDashboard,
  spyOnAppendedAnchor,
} from "../support/public-dashboard";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > public > dashboard", () => {
  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    dashboardId = await prepareDashboard(mb.api);
  });

  test("should allow users to create public dashboards", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, dashboardId);

    const uuid = await openNewPublicLinkDropdown(page, "dashboard");
    expect(uuid).not.toBeNull();

    const input = page.getByTestId("public-link-input");
    await expect(input).toBeVisible();
    await expect(input).not.toHaveAttribute("placeholder", "Loading…");
    await expect(input).toHaveValue(PUBLIC_DASHBOARD_REGEX);
  });

  // The three "setUser" variants of the shared "view public dashboard" test.
  const userVariants: {
    userType: string;
    setUser: (args: {
      mb: { signInAsAdmin: () => Promise<void>; signOut: () => Promise<void> };
      context: import("@playwright/test").BrowserContext;
    }) => Promise<void>;
  }[] = [
    {
      userType: "admin user",
      setUser: async ({ mb }) => {
        await mb.signInAsAdmin();
      },
    },
    {
      userType: "user with no permissions",
      setUser: async ({ context }) => {
        await signInWithCachedSession(context, "none");
      },
    },
    {
      userType: "anonymous user",
      setUser: async ({ mb }) => {
        await mb.signOut();
      },
    },
  ];

  for (const { userType, setUser } of userVariants) {
    test.describe(userType, () => {
      test("should be able to view public dashboards", async ({
        page,
        mb,
        context,
      }) => {
        const uuid = await createPublicLink(mb.api, "dashboard", dashboardId);
        await setUser({ mb, context });
        await page.goto(`/public/dashboard/${uuid}`);

        await expect(page.getByTestId("scalar-value")).toHaveText(COUNT_ALL);

        await filterWidget(page).first().click();
        await popover(page).getByText("Doohickey", { exact: true }).click();
        await popover(page)
          .getByRole("button", { name: "Add filter" })
          .click();

        await expect(page.getByTestId("scalar-value")).toHaveText(
          COUNT_DOOHICKEY,
        );
      });
    });
  }

  test("should respect 'disable auto-apply filters' in a public dashboard", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      auto_apply_filters: false,
    });
    await visitPublicDashboard(page, mb, dashboardId);

    await expect(page.getByTestId("scalar-value")).toHaveText(COUNT_ALL);
    await expect(applyFilterToast(page)).toHaveCount(0);

    await filterWidget(page).first().click();
    await popover(page).getByText("Doohickey", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Add filter" }).click();

    await expect(page.getByTestId("scalar-value")).toHaveText(COUNT_ALL);

    await applyFilterButton(page).click();
    await expect(applyFilterToast(page)).toHaveCount(0);
    await expect(page.getByTestId("scalar-value")).toHaveText(COUNT_DOOHICKEY);
  });

  test("should only display filters mapped to cards on the selected tab", async ({
    page,
    mb,
  }) => {
    await visitPublicDashboard(page, mb, dashboardId);

    const paramsContainer = dashboardParametersContainer(page);
    await expect(
      paramsContainer.getByText(TEXT_FILTER.name, { exact: true }),
    ).toBeVisible();
    await expect(
      paramsContainer.getByText(UNUSED_FILTER.name, { exact: true }),
    ).toHaveCount(0);

    await goToTab(page, TAB_2.name);

    await expect(dashboardParametersContainer(page)).toHaveCount(0);
    const embedFrame = page.getByTestId("embed-frame");
    await expect(
      embedFrame.getByText(TEXT_FILTER.name, { exact: true }),
    ).toHaveCount(0);
    await expect(
      embedFrame.getByText(UNUSED_FILTER.name, { exact: true }),
    ).toHaveCount(0);
  });

  test("should respect dashboard width setting in a public dashboard", async ({
    page,
    mb,
  }) => {
    await visitPublicDashboard(page, mb, dashboardId);

    // new dashboards should default to 'fixed' width
    await assertDashboardFixedWidth(page);

    // toggle full-width
    await mb.signInAsAdmin();
    await mb.api.put(`/api/dashboard/${dashboardId}`, { width: "full" });
    await visitPublicDashboard(page, mb, dashboardId);

    await assertDashboardFullWidth(page);
  });

  test("should render when a filter passed with value starting from '0' (metabase#41483)", async ({
    page,
    mb,
  }) => {
    await visitPublicDashboard(page, mb, dashboardId, {
      params: { text: "002" },
    });

    await expect.poll(() => page.url()).toContain("text=002");

    await expect(
      filterWidget(page).first().getByText("002", { exact: true }),
    ).toBeVisible();
  });

  test("should respect click behavior", async ({ page, mb }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      dashboardName: "test click behavior",
      questions: [
        {
          name: "orders",
          query: {
            "source-table": ORDERS_ID,
            limit: 5,
          },
        },
      ],
      cards: [
        {
          visualization_settings: {
            column_settings: {
              '["name","TOTAL"]': {
                click_behavior: {
                  type: "link",
                  linkType: "url",
                  linkTemplate: "https://metabase.com",
                },
              },
            },
          },
        },
      ],
    });
    await visitPublicDashboard(page, mb, dashboard.id);

    // Port of the appendChild spy: the "link" behavior appends an <a> to the
    // body and clicks it (lib/dom.js).
    await spyOnAppendedAnchor(page);

    await getDashboardCard(page).getByText("39.72", { exact: true }).click();

    const anchor = await getCapturedAnchor(page);
    expect(anchor?.tagName).toBe("A");
    expect(anchor?.href).toBe("https://metabase.com/");
  });

  test("should support #theme=dark (metabase#65731)", async ({ page, mb }) => {
    const dashboardName = "Dashboard Theme Test";
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      dashboardName,
      questions: [],
    });
    await visitPublicDashboard(page, mb, dashboard.id, {
      hash: { theme: "dark" },
    });

    // dark theme should have white text
    await expect(
      page.getByRole("heading", { name: dashboardName }),
    ).toHaveCSS("color", "rgba(255, 255, 255, 0.95)");
  });
});

test.describe("scenarios [EE] > public > dashboard", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    dashboardId = await prepareDashboard(mb.api);
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should set the window title to `{dashboard name} · {application name}`", async ({
    page,
    mb,
  }) => {
    await mb.api.updateSetting("application-name", "Custom Application Name");

    await visitPublicDashboard(page, mb, dashboardId);

    await expect(page).toHaveTitle("Test Dashboard · Custom Application Name");
  });

  test("should allow to set locale from the `#locale` hash parameter (metabase#50182)", async ({
    page,
    mb,
  }) => {
    // We don't have a de-CH.json file, so it should fallback to de.json, see
    // metabase#51039 for more details.
    const deLocale = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/app/locales/de.json",
    );

    await visitPublicDashboard(page, mb, dashboardId, {
      hash: { locale: "de-CH" },
    });

    await deLocale;

    await expect(
      page.getByRole("button", { name: "Automatische Aktualisierung" }),
    ).toBeVisible();

    await expect.poll(() => page.url()).toContain("locale=de");
  });

  test("should disable background via `#background=false` hash parameter when rendered inside an iframe (metabase#62391)", async ({
    page,
    mb,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { overrideIsWithinIframe?: boolean })
        .overrideIsWithinIframe = true;
    });
    await visitPublicDashboard(page, mb, dashboardId, {
      hash: { background: "false" },
    });

    await expect(page.getByTestId("embed-frame")).toBeVisible();

    await expect(page.locator("body.mb-wrapper")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  });

  test("should not disable background via `#background=false` hash parameter when rendered without an iframe", async ({
    page,
    mb,
  }) => {
    await visitPublicDashboard(page, mb, dashboardId, {
      hash: { background: "false" },
    });

    await expect(page.getByTestId("embed-frame")).toBeVisible();

    await expect(page.locator("body.mb-wrapper")).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  });

  test("should handle /api/session/properties incorrect response (metabase#62501)", async ({
    page,
    mb,
  }) => {
    await page.route("**/api/session/properties", (route) =>
      route.fulfill({
        status: 200,
        body: "<html><body><h1>Those aren't the droids you're looking for</h1></body></html>",
      }),
    );

    await visitPublicDashboard(page, mb, dashboardId);

    await expect(
      page.getByTestId("embed-frame").getByText("Test Dashboard", {
        exact: true,
      }),
    ).toBeVisible();
  });
});
