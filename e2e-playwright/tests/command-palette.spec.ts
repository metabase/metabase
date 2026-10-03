/**
 * Playwright port of e2e/test/scenarios/onboarding/command-palette.cy.spec.js
 *
 * Notes:
 * - Snowplow helpers run real assertions, backed by the per-slot collector via
 *   ../support/snowplow; the "shortcuts" describe is tagged ["@actions"] upstream.
 * - `cy.findByRole("button", { name: /search/i })` clicks are ported as
 *   commandPaletteButton (the same app-bar element, pre-scoped against
 *   strict-mode multi-matches).
 * - Palette queries type with pressSequentially — results are debounced
 *   search requests.
 * - createMockDocument/createMockDashboardCard aren't importable from
 *   metabase-types here; support/command-palette.ts carries minimal
 *   API-shaped stand-ins.
 * - "exist" assertions on virtualized palette rows are toBeAttached() (the
 *   upstream comment: reachable, not necessarily on screen).
 * - The keyboard-shortcut key "?" must be dispatched as Shift+Slash so the
 *   tinykeys "Shift+?" binding sees the shift modifier (see support module).
 */
import { test, expect } from "../support/fixtures";
import { resolveToken } from "../support/api";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  closeCommandPalette,
  commandPalette,
  commandPaletteAction,
  commandPaletteButton,
  commandPaletteInput,
  createDashboardWithTabs,
  createDocument,
  getHelpSubmenu,
  getProfileLink,
  goToAdmin,
  mockDashboardCard,
  modifyPermission,
  openCommandPalette,
  openShortcutModal,
  pressShortcut,
  saveChangesToPermissions,
  setActionsEnabledForDB,
  shortcutModal,
  startNewAction,
  startNewCollectionFromSidebar,
} from "../support/command-palette";
import { modal } from "../support/dashboard";
import {
  enableTracking,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { entityPickerModal } from "../support/notebook";
import { ORDERS_COUNT_QUESTION_ID } from "../support/organization";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DB_ID,
  USERS,
} from "../support/sample-data";
import { getSearchBar, visitFullAppEmbeddingUrl } from "../support/search";
import {
  navigationSidebar,
  openNavigationSidebar,
  popover,
  sidebarSection,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const { admin } = USERS;

const TAB_1 = { id: 1, name: "Tab 1" };
const TAB_2 = { id: 2, name: "Tab 2" };
const TAB_3 = { id: 3, name: "Tab 3" };
const TAB_4 = { id: 4, name: "Tab 4" };

/**
 * When keys are pressed too fast redux won't have enough time to update the
 * state, so conditions in subsequently called event handlers may not have
 * been updated yet. Upstream used cy.wait(1) as an event-loop yield; a
 * Playwright press round-trips CDP faster than a render, so give it a real
 * beat instead.
 */
const REAL_PRESS_DELAY = 100;

test.describe("command palette", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should render a searchable command palette", async ({ page, mb }) => {
    // we return a list of entities in a specific order to avoid flakiness.
    // "recency" score can sometimes cause the order to change and fail the test
    await page.route(
      (url) =>
        url.pathname === "/api/search" &&
        url.searchParams.get("q") === "Company" &&
        url.searchParams.get("context") === "command-palette",
      async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as { data: { name: string }[] };
        const orderedNames = ["Products", "Orders", "Reviews", "People"];
        body.data = body.data.sort(
          (a, b) => orderedNames.indexOf(a.name) - orderedNames.indexOf(b.name),
        );
        await route.fulfill({ response, json: body });
      },
    );

    // Add a description for a check
    await mb.api.put(`/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      description: "The best question",
    });

    // Request to have an item in the recents list
    await mb.api.get(`/api/dashboard/${ORDERS_DASHBOARD_ID}`);

    await page.goto("/");

    await commandPaletteButton(page).click();
    const palette = commandPalette(page);
    await expect(palette).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Orders in a dashboard", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await closeCommandPalette(page);
    await expect(palette).toHaveCount(0);

    // open the command palette with keybinding
    await openCommandPalette(page);
    const input = commandPaletteInput(palette);
    await expect(input).toBeAttached();

    // does not show actions if there is no search query
    await expect(palette.getByText("New question", { exact: true })).toHaveCount(0);
    await expect(palette.getByText("New SQL query", { exact: true })).toHaveCount(0);
    await expect(palette.getByText("New dashboard", { exact: true })).toHaveCount(0);
    await expect(palette.getByText("New collection", { exact: true })).toHaveCount(0);
    await expect(palette.getByText("New model", { exact: true })).toHaveCount(0);
    await expect(palette.getByText("New metric", { exact: true })).toHaveCount(0);

    // Should show recent items
    await expect(
      palette.getByRole("option", { name: "Orders in a dashboard", exact: true }),
    ).toContainText("Our analytics");

    // Should search entities and docs
    await input.pressSequentially("Orders, Count");

    const ordersCountOption = palette.getByRole("option", {
      name: "Orders, Count",
      exact: true,
    });
    await expect(ordersCountOption).toContainText("Our analytics");
    await expect(ordersCountOption).toContainText("The best question");

    await expect(
      palette.getByText('Search Metabase\'s docs for "Orders, Count"', {
        exact: true,
      }),
    ).toBeAttached();

    // Since the command palette list is virtualized, we will search for a few
    // to ensure they're reachable
    await input.fill("");
    await input.pressSequentially("People");
    await expect(
      palette.getByRole("option", { name: "People", exact: true }),
    ).toBeAttached();

    await input.fill("");
    await input.pressSequentially("Uploads");
    await expect(
      palette.getByRole("option", { name: "Settings - Uploads", exact: true }),
    ).toBeAttached();

    // When entering a query, if there are results that come before search results, highlight
    // the first action, otherwise, highlight the first search result
    await input.fill("");
    await input.pressSequentially("Form");
    await expect(
      palette.getByRole("option", { name: "Performance", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      palette.getByRole("option", { name: /View and filter/ }),
    ).toBeAttached();

    // Check that we are not filtering search results by action name
    await input.fill("");
    await input.pressSequentially("Company");
    await expect(
      palette.getByRole("option", { name: /View and filter/ }),
    ).toBeAttached();
    await expect(
      palette.getByRole("option", { name: "Products", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      palette.getByRole("option", { name: "People", exact: true }),
    ).toBeAttached();
    await expect(
      palette.getByRole("option", { name: "Reviews", exact: true }),
    ).toBeAttached();
    await input.fill("");

    await input.pressSequentially("New met");
    await expect(palette.getByText("New metric", { exact: true })).toBeAttached();

    // We can close the command palette using escape
    await closeCommandPalette(page);
    await expect(palette).toHaveCount(0);

    await openCommandPalette(page);

    await expect(
      palette.getByRole("option", { name: "Orders in a dashboard", exact: true }),
    ).toHaveAttribute("aria-selected", "true");

    await input.pressSequentially("New");
    await expect(palette.getByText(/loading/i)).toHaveCount(0);
    await expect(
      palette.getByText("No results for “New”", { exact: true }),
    ).toBeVisible();

    // Every "New …" action matches "New" equally, so the default order applies
    // and "New question" is first and selected by default.
    const newQuestion = palette.getByRole("option", {
      name: "New question",
      exact: true,
    });
    const newModel = palette.getByRole("option", {
      name: "New model",
      exact: true,
    });
    const searchNewDocs = palette.getByRole("option", {
      name: 'Search Metabase\'s docs for "New"',
      exact: true,
    });

    await expect(newQuestion).toHaveAttribute("aria-selected", "true");

    await page.waitForTimeout(100); // pressing page down too fast does nothing
    await page.keyboard.press("PageDown");
    await expect(newModel).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("PageDown");
    await expect(searchNewDocs).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("PageUp");
    await expect(newModel).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("PageUp");
    await expect(newQuestion).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("End");
    await expect(searchNewDocs).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Home");
    await expect(newQuestion).toHaveAttribute("aria-selected", "true");
  });

  test("should display search results in the order returned by the API", async ({
    page,
  }) => {
    await page.goto("/");

    await commandPaletteButton(page).click();
    const palette = commandPalette(page);

    const searchData = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/search" && url.searchParams.has("q");
    });
    await commandPaletteInput(palette).pressSequentially("Cou");
    const response = await searchData;
    const results = ((await response.json()) as { data: { name: string }[] })
      .data;

    await expect(palette.getByText("Loading...", { exact: true })).toHaveCount(0);

    // Upstream slices options [3, -2): 3 actions before the search results
    // and 2 items (docs search + "View and filter") after them.
    const options = palette.getByRole("option");
    await expect(options).toHaveCount(results.length + 5);
    for (const [index, result] of results.entries()) {
      await expect(options.nth(index + 3)).toContainText(result.name);
    }
  });

  // Making this a separate test for now because it requires the bleeding edge token, which
  // Enables a bunch of other stuff and messes up the "Renders a searchable command palette"
  // test. In the future, this can be integrated into the test above, or moved to a BE test
  test("should display collection names for documents in recents", async ({
    page,
    mb,
  }) => {
    // Create a document so that it appears in the recents list
    await createDocument(mb.api, {
      collection_id: ADMIN_PERSONAL_COLLECTION_ID,
    });

    await page.goto("/");

    await commandPaletteButton(page).click();
    await expect(commandPalette(page)).toBeVisible();

    // UXW-1786
    await expect(
      page.getByRole("option", { name: "Test Document", exact: true }),
    ).toContainText("Bobby Tables's Personal Collection");
  });

  test.describe("admin settings links", () => {
    test("should render links to all admin settings pages for admins", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(
        page.getByTestId("home-page").getByText(/see what metabase can do/i),
      ).toBeAttached();

      await openCommandPalette(page);
      const palette = commandPalette(page);
      const input = commandPaletteInput(palette);

      await input.pressSequentially("Settings -");
      // check admin sees all settings links
      await expect(
        commandPaletteAction(palette, "Settings - General"),
      ).toBeVisible();
      await expect(
        commandPaletteAction(palette, "Settings - Email"),
      ).toBeVisible();
      await input.fill("");

      // should see admin links
      await input.pressSequentially("Performance");
      await expect(commandPaletteAction(palette, "Performance")).toBeVisible();
    });

    test("should not render any links to settings or admin pages for non-admins without privledged access", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      await page.goto("/");
      await expect(
        page.getByTestId("home-page").getByText(/see what metabase can do/i),
      ).toBeAttached();

      await openCommandPalette(page);
      const palette = commandPalette(page);
      const input = commandPaletteInput(palette);

      // check normal user does not see any setting links
      await input.pressSequentially("Settings -");
      await expect(
        commandPaletteAction(palette, "Settings - Setup"),
      ).toHaveCount(0);
      await expect(
        commandPaletteAction(palette, "Settings - General"),
      ).toHaveCount(0);
      await input.fill("");

      // should not see admin links
      await input.pressSequentially("Performance");
      await expect(commandPaletteAction(palette, "Performance")).toHaveCount(0);
      await input.fill("");

      // Tools
      await input.pressSequentially("tool");
      await expect(commandPaletteAction(palette, "Tools")).toHaveCount(0);
      await input.fill("");

      // Database and table metadata
      await input.pressSequentially("data");
      await expect(commandPaletteAction(palette, "Databases")).toHaveCount(0);
      await input.fill("");
      await input.pressSequentially("tabl");
      await expect(
        commandPaletteAction(palette, "Table Metadata"),
      ).toHaveCount(0);
    });

    test.describe("with advanced permissions", () => {
      test.skip(
        !resolveToken("pro-self-hosted"),
        "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
      );

      test("should render links for non-admins that have specific privileges", async ({
        page,
        mb,
      }) => {
        // setup permissions
        await mb.api.activateToken("pro-self-hosted");
        await page.goto("/admin/permissions/application");

        const SETTINGS_INDEX = 0;
        const MONITORING_INDEX = 1;
        await modifyPermission(page, "All Users", SETTINGS_INDEX, "Yes");
        await modifyPermission(page, "All Users", MONITORING_INDEX, "Yes");

        await saveChangesToPermissions(page);

        await page.getByRole("tab", { name: "Data", exact: true }).click();
        await page
          .getByRole("menuitem", { name: "All Users", exact: true })
          .click();

        const TABLE_METADATA_INDEX = 3;
        const DATABASE_INDEX = 4;

        await modifyPermission(
          page,
          "Sample Database",
          TABLE_METADATA_INDEX,
          "Yes",
        );
        await modifyPermission(page, "Sample Database", DATABASE_INDEX, "Yes");

        await saveChangesToPermissions(page);

        await mb.signInAsNormalUser();

        // test
        await page.goto("/");
        await expect(
          page.getByTestId("home-page").getByText(/see what metabase can do/i),
        ).toBeAttached();

        await openCommandPalette(page);
        const palette = commandPalette(page);
        const input = commandPaletteInput(palette);

        // Settings Pages
        await input.pressSequentially("Settings -");
        // check user with settings permissions see non-admin restricted settings links
        await expect(
          commandPaletteAction(palette, "Settings - Setup"),
        ).toHaveCount(0);
        await expect(
          commandPaletteAction(palette, "Settings - General"),
        ).toBeAttached();
        await input.fill("");

        // Tools
        await input.pressSequentially("tool");
        await expect(commandPaletteAction(palette, "Tools")).toBeAttached();
        await input.fill("");

        // Database and table metadata
        await input.pressSequentially("data");
        await expect(commandPaletteAction(palette, "Databases")).toBeAttached();
        await input.fill("");
        await input.pressSequentially("tabl");
        await expect(
          commandPaletteAction(palette, "Table Metadata"),
        ).toBeAttached();
        await input.fill("");

        // should not see other admin links
        await input.pressSequentially("Performance");
        await expect(
          commandPaletteAction(palette, "Performance"),
        ).toHaveCount(0);
      });
    });
  });

  test("should not be accessible when doing full app embedding", async ({
    page,
    mb,
  }) => {
    const embed = await visitFullAppEmbeddingUrl(page, {
      url: "/",
      baseUrl: mb.baseUrl,
      qs: {
        top_nav: true,
        search: true,
      },
    });

    await getSearchBar(embed).click();
    await expect(embed.getByRole("button", { name: / \+ K/ })).toHaveCount(0);

    await page.keyboard.press("Escape");

    await openCommandPalette(page);
    await expect(commandPalette(embed)).toHaveCount(0);
  });

  test("should not be accessible when a user is not logged in", async ({
    page,
    mb,
  }) => {
    const searchRequests: string[] = [];
    const databaseRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") {
        return;
      }
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/api/search")) {
        searchRequests.push(request.url());
      }
      if (pathname === "/api/database") {
        databaseRequests.push(request.url());
      }
    });

    await mb.signOut();
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Sign in to Metabase", exact: true }),
    ).toBeVisible();

    await openCommandPalette(page);
    await expect(commandPalette(page)).toHaveCount(0);

    expect(databaseRequests).toHaveLength(0);
    expect(searchRequests).toHaveLength(0);

    await page.getByLabel(/Email address/).fill(admin.email);
    await page.getByLabel("Password", { exact: true }).fill(admin.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByTestId("greeting-message")).toBeVisible();

    await openCommandPalette(page);
    await expect(commandPalette(page)).toBeVisible();
  });

  test("The Search button should resize when on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iphone-x
    await page.goto("/");
    await expect(commandPaletteButton(page)).toBeVisible();
    await expect(commandPaletteButton(page)).not.toContainText("search");
  });

  test("Should have a new metric item", async ({ page }) => {
    await page.goto("/");
    await commandPaletteButton(page).click();

    const palette = commandPalette(page);
    const input = commandPaletteInput(palette);
    await expect(input).toBeAttached();
    await input.pressSequentially("Me");

    const newMetric = palette.getByText("New metric", { exact: true });
    await expect(newMetric).toBeVisible();
    await newMetric.click();

    await page.waitForURL((url) => url.pathname === "/metric/new");
  });

  test("should show the 'Download diagnostics' command palette item", async ({
    page,
  }) => {
    await page.goto("/");
    await commandPaletteButton(page).click();

    const palette = commandPalette(page);
    const input = commandPaletteInput(palette);
    await expect(input).toBeAttached();
    await input.pressSequentially("Issue");
    await expect(
      palette.getByText("Download diagnostics", { exact: true }),
    ).toBeVisible();
  });

  test("should allow searching personal collections if no results and user is admin", async ({
    page,
  }) => {
    await page.goto("/");
    await commandPaletteButton(page).click();
    // cy.realType typed blind, relying on the palette input's autofocus;
    // typing into the input locator keeps real keystrokes but auto-waits
    // for it to be ready.
    await commandPaletteInput(commandPalette(page)).pressSequentially("asdf");
    // Upstream chains .get() off commandPalette(), which in Cypress silently
    // queries the whole document — the element lives in the palette anyway.
    await expect(
      commandPalette(page).locator("#search-results-metadata"),
    ).toContainText("Search everything");
  });

  test("should show the 'New embed' command palette item", async ({ page }) => {
    await page.goto("/");
    await commandPaletteButton(page).click();

    const palette = commandPalette(page);
    const input = commandPaletteInput(palette);
    await expect(input).toBeAttached();
    await input.pressSequentially("new embed");
    await expect(palette.getByText("New embed", { exact: true })).toBeVisible();
  });

  test.describe("ee", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should have a 'New document' item", async ({ page }) => {
      await page.goto("/");
      await commandPaletteButton(page).click();

      const palette = commandPalette(page);
      const input = commandPaletteInput(palette);
      await expect(input).toBeVisible();
      await input.pressSequentially("new document");

      const newDocument = palette.getByText("New document", { exact: true });
      await expect(newDocument).toBeVisible();
      await newDocument.click();
      await page.waitForURL((url) => url.pathname === "/document/new");
    });
  });
});

// Tagged ["@actions"] upstream.
test.describe("shortcuts", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);
  });

  test("should render a shortcuts modal, and global shortcuts should be available", async ({
    page,
    mb,
  }) => {
    await setActionsEnabledForDB(mb.api, SAMPLE_DB_ID);
    await page.goto("/");
    await expect(
      page.getByTestId("home-page").getByTestId("loading-indicator"),
    ).toHaveCount(0);
    await openShortcutModal(page);

    const modalLocator = shortcutModal(page);
    await expect(
      modalLocator.getByRole("tab", { name: "General", exact: true }),
    ).toBeAttached();
    await expect(
      modalLocator.getByRole("tab", { name: "Dashboards", exact: true }),
    ).toBeAttached();
    await page.keyboard.press("Escape");
    await expect(modalLocator).toHaveCount(0);
    await openShortcutModal(page);
    // Not in the upstream test: without waiting for the modal, the closing
    // "?" below can be dispatched before the opening one has taken effect.
    await expect(modalLocator).toBeAttached();
    // cy.realPress("?") — shift-dispatched for the same reason as opening
    await page.keyboard.press("Shift+Slash");
    await expect(modalLocator).toHaveCount(0);

    await getProfileLink(page).click();
    await popover(page).getByText("Help", { exact: true }).click();
    await getHelpSubmenu(page)
      .getByText("Keyboard shortcuts", { exact: true })
      .click();
    await expect(modalLocator).toBeAttached();
    await page.keyboard.press("Escape");
    await expect(modalLocator).toHaveCount(0);

    // Test a few global shortcuts
    await pressShortcut(page, ["c", "f"], () =>
      expect(page.getByRole("dialog", { name: /collection/i })).toBeAttached({
        timeout: 3000,
      }),
    );
    await page.keyboard.press("Escape");
    // Wait for the dialog to actually close: kbar shortcuts stay disabled
    // until the Mantine close transition finishes and the modal unmounts, so
    // a keystroke dispatched inside that window is silently dropped (Cypress
    // command latency masked this).
    await expect(
      page.getByRole("dialog", { name: /collection/i }),
    ).toHaveCount(0);
    await expectUnstructuredSnowplowEvent(mb, {
      event: "keyboard_shortcut_performed",
      event_detail: "create-new-collection",
    });

    const palette = commandPalette(page);
    const input = commandPaletteInput(palette);
    // Self-healing open: kbar's own $mod+k toggle is subject to the same
    // dropped-keystroke windows as the registered shortcuts.
    await pressShortcut(page, "ControlOrMeta+k", () =>
      expect(input).toBeVisible({ timeout: 3000 }),
    );
    await input.pressSequentially("new dashboard");
    await palette
      .getByRole("option", { name: "New dashboard", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: /dashboard/i })).toBeAttached();
    await page.keyboard.press("Escape");
    // See close-transition note above.
    await expect(page.getByRole("dialog", { name: /dashboard/i })).toHaveCount(0);

    // Using a command palette action registered as a shortcut should only
    // emit snowplow events when using keyboard shortcuts, not command palette
    await expectUnstructuredSnowplowEvent(
      mb,
      {
        event: "keyboard_shortcut_performed",
        event_detail: "create-new-dashboard",
      },
      0,
    );

    await pressShortcut(page, ["c", "d"], () =>
      expect(page.getByRole("dialog", { name: /dashboard/i })).toBeAttached({
        timeout: 3000,
      }),
    );
    await page.keyboard.press("Escape");
    // See close-transition note above.
    await expect(page.getByRole("dialog", { name: /dashboard/i })).toHaveCount(0);
    await expectUnstructuredSnowplowEvent(
      mb,
      {
        event: "keyboard_shortcut_performed",
        event_detail: "create-new-dashboard",
      },
      1,
    );

    await pressShortcut(page, ["g", "d"], () =>
      page.waitForURL((url) => url.pathname.includes("browse/databases"), {
        timeout: 3000,
      }),
    );

    // Upstream note: there is no global "$mod+[" binding — only the bare "["
    // (toggle-navbar) — and the sidebar is already visible on browse pages,
    // so this press + assertion verify nothing. Kept for parity.
    await page.keyboard.press("Meta+[");
    await expect(navigationSidebar(page)).toBeVisible();

    await pressShortcut(page, "[", () =>
      expect(navigationSidebar(page)).toBeHidden({ timeout: 3000 }),
    );
    await pressShortcut(page, "[", () =>
      expect(navigationSidebar(page)).toBeVisible({ timeout: 3000 }),
    );
    await expectUnstructuredSnowplowEvent(
      mb,
      {
        event: "keyboard_shortcut_performed",
        event_detail: "toggle-navbar",
      },
      2,
    );

    await pressShortcut(page, ["g", "p"], () =>
      page.waitForURL(
        (url) => url.pathname === `/collection/${ADMIN_PERSONAL_COLLECTION_ID}`,
        { timeout: 3000 },
      ),
    );
    await expectUnstructuredSnowplowEvent(mb, {
      event: "keyboard_shortcut_performed",
      event_detail: "navigate-personal-collection",
    });

    await pressShortcut(page, ["g", "t"], () =>
      page.waitForURL((url) => url.pathname === "/trash", { timeout: 3000 }),
    );
    await expectUnstructuredSnowplowEvent(mb, {
      event: "keyboard_shortcut_performed",
      event_detail: "navigate-trash",
    });

    await pressShortcut(page, ["g", "s"], () =>
      page.waitForURL((url) => /^\/data-studio/.test(url.pathname), {
        timeout: 3000,
      }),
    );
    await expectUnstructuredSnowplowEvent(mb, {
      event: "keyboard_shortcut_performed",
      event_detail: "navigate-data-studio",
    });

    // "g m" navigates back to the main app (browse/models); the URL check is
    // the retry signal — the upstream sidebar assertion below can't detect a
    // dropped press.
    await pressShortcut(page, ["g", "m"], () =>
      page.waitForURL((url) => url.pathname.includes("browse/models"), {
        timeout: 3000,
      }),
    );

    // shortcuts should not be enabled when working in a modal (ADM 658)
    await expect(navigationSidebar(page)).toBeVisible();
    // Mantine Modals
    await startNewCollectionFromSidebar(page);

    await page
      .getByTestId("new-collection-modal")
      .getByLabel(/collection it's saved in/i)
      .click();

    // Remove focus
    await entityPickerModal(page).getByRole("heading").click();

    await page.keyboard.press("[");
    await expect(navigationSidebar(page)).toBeVisible();
    await page.keyboard.press("Escape");
    // Gate on the picker being gone so the next "[" tests suppression by the
    // still-open collection modal, not by the closing picker.
    await expect(entityPickerModal(page)).toHaveCount(0);
    await page.keyboard.press("[");
    await expect(navigationSidebar(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("new-collection-modal")).toHaveCount(0);

    // Legacy Modals
    await startNewAction(page);

    // Remove focus
    await modal(page).getByText(/Build custom forms/).click();
    await page.keyboard.press("[");
    await expect(navigationSidebar(page)).toBeVisible();
    await page.keyboard.press("Escape");
    // See close-transition note above: the next "[" must land after the
    // action modal has fully closed and re-enabled shortcuts.
    await expect(page.getByTestId("action-creator")).toHaveCount(0);
    await expect(modal(page)).toHaveCount(0);
    await pressShortcut(page, "[", () =>
      expect(navigationSidebar(page)).toBeHidden({ timeout: 3000 }),
    );

    await goToAdmin(page);

    await expect(page.getByTestId("site-name-setting")).toBeAttached();
    await page.waitForURL((url) => url.pathname.includes("/admin/settings"));
    await pressShortcut(page, "5", () =>
      page.waitForURL((url) => url.pathname.includes("/admin/datamodel"), {
        timeout: 3000,
      }),
    );
    await pressShortcut(page, "9", () =>
      page.waitForURL((url) => url.pathname.includes("/admin/tools"), {
        timeout: 3000,
      }),
    );
  });

  test("should not navigate to data studio via shortcut for non-admin users", async ({
    page,
    mb,
  }) => {
    await mb.signInAsNormalUser();
    await page.goto("/");
    await expect(
      page.getByTestId("home-page").getByText(/see what metabase can do/i),
    ).toBeAttached();

    await page.keyboard.press("g");
    await page.keyboard.press("s");
    // Give a would-be navigation a chance to happen before asserting it
    // didn't (the upstream assertion passed instantly against the current
    // URL, so it could never catch a slow redirect).
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("should support dashboard shortcuts", async ({ page, mb }) => {
    const dashboard = await createDashboardWithTabs(mb.api, {
      tabs: [TAB_1, TAB_2, TAB_3, TAB_4],
      dashcards: [
        mockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_1.id,
        }),
        mockDashboardCard({
          id: -2,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_2.id,
        }),
        mockDashboardCard({
          id: -3,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_3.id,
        }),
        mockDashboardCard({
          id: -4,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_4.id,
        }),
      ],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    await openShortcutModal(page);
    await expect(shortcutModal(page)).toBeAttached();
    await page.keyboard.press("Escape");
    // Wait for the modal to fully close: kbar shortcuts stay disabled until
    // the Mantine close transition finishes and the modal unmounts, so an
    // "o" dispatched inside that window is silently dropped.
    await expect(shortcutModal(page)).toHaveCount(0);

    // Sidebar opened before pressing "o" (upstream opened it after) so the
    // bookmark section check can double as the pressShortcut retry signal.
    await openNavigationSidebar(page);
    await pressShortcut(page, "o", () =>
      expect(sidebarSection(page, "Bookmarks")).toContainText(
        "Test Dashboard",
        { timeout: 3000 },
      ),
    );
    await pressShortcut(page, "o", () =>
      expect(sidebarSection(page, "Bookmarks")).toHaveCount(0, {
        timeout: 3000,
      }),
    );

    await pressShortcut(page, "e", () =>
      expect(page.getByTestId("edit-bar")).toContainText(
        "You're editing this dashboard",
        { timeout: 3000 },
      ),
    );
    await pressShortcut(page, "f", () =>
      expect(page.getByRole("menu", { name: /add a filter/i })).toBeAttached({
        timeout: 3000,
      }),
    );
    await page.keyboard.press("Escape");
    // Gate the next press on the menu being gone (close-transition race).
    await expect(
      page.getByRole("menu", { name: /add a filter/i }),
    ).toHaveCount(0);
    await pressShortcut(page, "e", () =>
      expect(page.getByTestId("edit-bar")).toHaveCount(0, { timeout: 3000 }),
    );

    await pressShortcut(page, "]", () =>
      expect(
        page.getByRole("dialog", { name: "Info", exact: true }),
      ).toBeAttached({ timeout: 3000 }),
    );
    await pressShortcut(page, "]", () =>
      expect(
        page.getByRole("dialog", { name: "Info", exact: true }),
      ).toHaveCount(0, { timeout: 3000 }),
    );

    await expect(
      page.getByRole("tab", { name: "Tab 1", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await pressShortcut(page, "3", () =>
      expect(
        page.getByRole("tab", { name: "Tab 3", exact: true }),
      ).toHaveAttribute("aria-selected", "true", { timeout: 3000 }),
    );
    await pressShortcut(page, "1", () =>
      expect(
        page.getByRole("tab", { name: "Tab 1", exact: true }),
      ).toHaveAttribute("aria-selected", "true", { timeout: 3000 }),
    );
    // Doesn't error on pressing numbers out of bounds
    await page.keyboard.press("7");
    await expect(
      page.getByRole("tab", { name: "Tab 1", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("should support query builder shortcuts", async ({ page }) => {
    await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);

    // Upstream focused this header so `f` wouldn't expand the Cypress spec
    // list; kept for keyboard-target parity.
    // Filter
    const filterHeader = page.getByTestId("question-filter-header");
    await expect(filterHeader).toBeAttached();
    await filterHeader.focus();
    await expect(page.getByRole("dialog", { name: /filter/i })).toHaveCount(0);
    await pressShortcut(page, "f", () =>
      expect(page.getByRole("dialog", { name: /filter/i })).toBeAttached({
        timeout: 3000,
      }),
    );
    await page.keyboard.press("Escape");
    // Wait for the modal to fully close: kbar shortcuts stay disabled until
    // the Mantine close transition finishes and the modal unmounts, so a
    // keystroke dispatched inside that window is silently dropped.
    await expect(page.getByRole("dialog", { name: /filter/i })).toHaveCount(0);

    // Summarize sidebar
    await pressShortcut(page, "s", () =>
      expect(page.getByTestId("sidebar-content")).toContainText(
        "Summarize by",
        { timeout: 3000 },
      ),
    );
    await pressShortcut(page, "s", () =>
      expect(page.getByTestId("sidebar-content")).toHaveCount(0, {
        timeout: 3000,
      }),
    );

    // Sidesheet
    await pressShortcut(page, "]", () =>
      expect(
        page.getByRole("dialog", { name: "Info", exact: true }),
      ).toBeAttached({ timeout: 3000 }),
    );
    await page.waitForTimeout(REAL_PRESS_DELAY);
    await pressShortcut(page, "]", () =>
      expect(
        page.getByRole("dialog", { name: "Info", exact: true }),
      ).toHaveCount(0, { timeout: 3000 }),
    );

    // Viz Settings
    await pressShortcut(page, "y", () =>
      expect(page.getByTestId("chartsettings-sidebar")).toBeAttached({
        timeout: 3000,
      }),
    );
    await page.waitForTimeout(REAL_PRESS_DELAY);
    await pressShortcut(page, "y", () =>
      expect(page.getByTestId("chartsettings-sidebar")).toHaveCount(0, {
        timeout: 3000,
      }),
    );

    // Viz toggle
    await expect(page.getByTestId("visualization-root")).toHaveAttribute(
      "data-viz-ui-name",
      "Line",
    );
    await pressShortcut(page, "v", () =>
      expect(page.getByTestId("visualization-root")).toHaveAttribute(
        "data-viz-ui-name",
        "Table",
        { timeout: 3000 },
      ),
    );

    // toggle notebook mode
    await expect(page.getByTestId("step-data-0-0")).toHaveCount(0);
    await pressShortcut(page, "e", () =>
      expect(page.getByTestId("step-data-0-0")).toBeAttached({
        timeout: 3000,
      }),
    );
    await pressShortcut(page, "e", () =>
      expect(page.getByTestId("step-data-0-0")).toHaveCount(0, {
        timeout: 3000,
      }),
    );
    await expect(page.getByTestId("visualization-root")).toBeAttached();
  });
});
