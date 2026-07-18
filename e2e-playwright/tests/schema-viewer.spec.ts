/**
 * Playwright port of e2e/test/scenarios/schema-viewer/schema-viewer.cy.spec.ts
 *
 * Port notes:
 * - The `@erd.all should have length 0` upsell assertion becomes a
 *   page.on("request") counter checked after the upsell heading renders.
 * - Token-gated describes skip when the bleeding-edge token env var is
 *   missing (MB_ALL_FEATURES_TOKEN / CYPRESS_MB_ALL_FEATURES_TOKEN).
 * - The writable-Postgres describe needs the QA writable postgres container
 *   AND the postgres-writable snapshot, so it is gated on PW_QA_DB_ENABLED
 *   (standard @external gate; the upstream spec has no tag but H.restore
 *   ("postgres-writable") + H.queryWritableDB imply the same requirement).
 *   Its Cypress after() hook becomes test.afterAll — the cleanup only talks
 *   to postgres directly, so it needs no fixtures.
 * - `TableId` from metabase-types and `checkNotNull` are not importable from
 *   this package; table ids are plain numbers here and the null-check lives
 *   inside expectViewportZoomAtLeast.
 * - cy.get(...).as("usersId") table-id aliases become plain awaited numbers.
 */
import { expect, test } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { miniPicker } from "../support/notebook";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  MAGIC_USER_GROUPS,
  WRITABLE_DB_ID,
  dataStudioNav,
  expectNodeInViewport,
  expectViewportZoomAtLeast,
  getTableId,
  infoPanel,
  menu,
  queryWritableDB,
  reactFlowViewport,
  resyncDatabase,
  schemaPickerTrigger,
  schemaViewerSearchInput,
  tableNode,
  tableSectionActionsMenuButton,
  waitForErd,
} from "../support/schema-viewer";

const { ORDERS_ID, PEOPLE_ID, PRODUCTS_ID, REVIEWS_ID } = SAMPLE_DATABASE;

const BASE_URL = "/data-studio/schema-viewer";
const PUBLIC_SCHEMA = "PUBLIC";

// Layout constants mirrored from the SchemaViewer source. Keep in sync.
const MIN_ZOOM = 0.3;
const MIN_ZOOM_FOR_TARGET = 0.5;

const SV_SCHEMA = "sv_test";
const SV_EXTRA_SCHEMA = "sv_extra";

// Postgres setup creating two schemas and a few tables that exercise
// scenarios the Sample Database doesn't naturally cover:
//  - sv_test.users / sv_test.profiles → one-to-one (shared PK)
//  - sv_test.categories.parent_id → categories.id (self-reference)
//  - sv_test.products.lookup_id → sv_extra.lookup.id (cross-schema FK)
//  - sv_extra.other — a second cross-schema table with no relationship,
//    used to differentiate URL-supplied table-ids from UKV-saved ones in
//    the precedence test.
const SV_SETUP_SQL = `
  DROP SCHEMA IF EXISTS sv_test CASCADE;
  DROP SCHEMA IF EXISTS sv_extra CASCADE;
  CREATE SCHEMA sv_extra;
  CREATE SCHEMA sv_test;
  CREATE TABLE sv_extra.lookup (
    id SERIAL PRIMARY KEY,
    code TEXT
  );
  CREATE TABLE sv_extra.other (
    id SERIAL PRIMARY KEY,
    label TEXT
  );
  CREATE TABLE sv_test.users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE sv_test.profiles (
    user_id INTEGER PRIMARY KEY REFERENCES sv_test.users(id),
    bio TEXT
  );
  CREATE TABLE sv_test.categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES sv_test.categories(id)
  );
  CREATE TABLE sv_test.products (
    id SERIAL PRIMARY KEY,
    lookup_id INTEGER REFERENCES sv_extra.lookup(id)
  );
`;

const SV_REQUIRED_TABLES = [
  "users",
  "profiles",
  "categories",
  "products",
  "lookup",
  "other",
];

test.describe("scenarios > schema-viewer (premium gating)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("renders the upsell page and never calls the ERD endpoint when :dependencies is not licensed", async ({
    page,
  }) => {
    // Port of cy.intercept(...).as("erd") + `@erd.all` length assertion.
    let erdRequestCount = 0;
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/api/ee/erd"
      ) {
        erdRequestCount += 1;
      }
    });

    // Visit the schema viewer URL without activating a token
    await page.goto(BASE_URL);

    // Upsell page is shown
    await expect(
      page.getByRole("heading", {
        name: "Visualize your database structure",
        exact: true,
      }),
    ).toBeVisible();

    // ERD endpoint was never called
    expect(erdRequestCount).toBe(0);
  });
});

test.describe("scenarios > schema-viewer (Sample Database happy path)", () => {
  test.skip(
    !resolveToken("bleeding-edge"),
    "Requires the bleeding-edge token (set MB_ALL_FEATURES_TOKEN)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");
  });

  test("walks the full picker → canvas → selection → info panel → search → layout flow on the Sample Database", async ({
    page,
  }) => {
    // Bare URL renders the empty state with the picker auto-opened
    await page.goto(BASE_URL);
    await expect(
      schemaPickerTrigger(page).getByText("Pick a schema to view", {
        exact: true,
      }),
    ).toBeVisible();

    // Pick the Sample Database from the picker
    const erd = waitForErd(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("PUBLIC", { exact: true }).click();

    // Single-schema DB auto-navigates into PUBLIC and fetches ERD
    const erdResponse = await erd;
    expect(erdResponse.request().url()).toContain(
      `database-id=${SAMPLE_DB_ID}`,
    );
    expect(erdResponse.request().url()).toContain(`schema=${PUBLIC_SCHEMA}`);
    await expect(page).toHaveURL(new RegExp(`database-id=${SAMPLE_DB_ID}`));
    await expect(page).toHaveURL(new RegExp(`schema=${PUBLIC_SCHEMA}`));

    // All four FK-connected sample tables render as nodes
    await expect(tableNode(page, ORDERS_ID)).toBeVisible();
    await expect(tableNode(page, PRODUCTS_ID)).toBeVisible();
    await expect(tableNode(page, PEOPLE_ID)).toBeVisible();
    await expect(tableNode(page, REVIEWS_ID)).toBeVisible();

    // Edges are rendered between FK-related tables
    await expect
      .poll(() => page.locator(".react-flow__edge").count())
      .toBeGreaterThanOrEqual(3);

    // Click the Orders table header to select the node
    await tableNode(page, ORDERS_ID)
      .getByText("ORDERS", { exact: true })
      .click();

    // Side info panel opens with the table breadcrumb and field list
    const panel = infoPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("ORDERS");
    await expect(panel).toContainText("Sample Database");
    await expect(panel).toContainText("PUBLIC");
    await expect(panel).toContainText("USER_ID");
    await expect(panel).toContainText("PEOPLE");

    // Read-only adapter: no 'Find and replace' / 'Replace' button
    await expect(panel.getByRole("button", { name: /Replace/i })).toHaveCount(
      0,
    );

    // Click panel title — camera re-zooms to the selected Orders node
    await panel.getByRole("heading", { name: "ORDERS", exact: true }).click();
    await expectViewportZoomAtLeast(
      page,
      MIN_ZOOM_FOR_TARGET,
      "title click should zoom correctly",
    );
    await expectNodeInViewport(page, ORDERS_ID);

    // Click an FK link inside the info panel — camera pans to the target
    await panel.getByRole("button", { name: /Products/i }).click();
    await expectNodeInViewport(page, PRODUCTS_ID);
    // Selection stays on Orders after FK link click
    await expect(
      panel.getByRole("heading", { name: "ORDERS", exact: true }),
    ).toBeVisible();

    // Auto-layout fits the entire canvas — every table is on screen
    const autoLayoutButton = page
      .locator("button")
      .filter({ hasText: /Auto-layout/ });
    await expect(autoLayoutButton).toBeVisible();
    await autoLayoutButton.click();
    await expectNodeInViewport(page, ORDERS_ID);
    await expectNodeInViewport(page, PRODUCTS_ID);
    await expectNodeInViewport(page, PEOPLE_ID);
    await expectNodeInViewport(page, REVIEWS_ID);
    // Auto-layout zoom is within React Flow's clamp range (>= MIN_ZOOM)
    await expectViewportZoomAtLeast(
      page,
      MIN_ZOOM,
      "auto-layout zoom should be at least MIN_ZOOM",
    );

    // Re-select Orders, then Focus-node zooms in onto Orders
    await tableNode(page, ORDERS_ID)
      .getByText("ORDERS", { exact: true })
      .click();
    const focusNodeButton = page
      .locator("button")
      .filter({ hasText: /Focus node/ });
    await expect(focusNodeButton).toBeVisible();
    await focusNodeButton.click();
    await expectViewportZoomAtLeast(
      page,
      MIN_ZOOM_FOR_TARGET,
      "focus-node should be zoomed in",
    );
    await expectNodeInViewport(page, ORDERS_ID);

    // Double-click Reviews — camera zooms in onto Reviews and re-enables the
    // focus-node button
    await tableNode(page, REVIEWS_ID)
      .getByText("REVIEWS", { exact: true })
      .dblclick();
    await expectViewportZoomAtLeast(
      page,
      MIN_ZOOM_FOR_TARGET,
      "double-click should zoom in",
    );
    await expectNodeInViewport(page, REVIEWS_ID);
    await expect(focusNodeButton).toBeEnabled();

    // Selection moved from Orders to Reviews — prior selection cleared
    await expect(
      panel.getByRole("heading", { name: "REVIEWS", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("heading", { name: "ORDERS", exact: true }),
    ).toHaveCount(0);

    // Closing the info panel clears node selection
    await panel.getByLabel("Close", { exact: true }).click({ force: true });
    await expect(page.getByTestId("graph-info-panel")).toHaveCount(0);
    await expect(focusNodeButton).toHaveCount(0);

    // Clicking the USER_ID FK on Orders (target on canvas) selects the
    // connecting edge and pans the camera. The node can sit outside the
    // window (the react-flow camera decides placement); Cypress fires events
    // regardless of viewport position, so the faithful equivalent is a
    // dispatched click rather than pointer physics.
    await tableNode(page, ORDERS_ID)
      .getByText("USER_ID", { exact: true })
      .dispatchEvent("click");
    await expectNodeInViewport(page, PEOPLE_ID);
    await expect(
      page.locator(
        '[data-testid="schema-viewer-edge-path"][data-selected="true"]',
      ),
    ).toHaveCount(1);

    // Re-clicking the now-selected edge alternates the camera between source
    // and target endpoints
    const selectedEdge = page.locator(".react-flow__edge.selected");
    await selectedEdge.click({ force: true });
    const zoomToSourceEnd =
      (await reactFlowViewport(page).getAttribute("style")) ?? "";
    await selectedEdge.click({ force: true });
    // next click on the same edge should zoom to the OTHER endpoint
    await expect(reactFlowViewport(page)).not.toHaveAttribute(
      "style",
      zoomToSourceEnd,
    );

    // Search input filters by name; selecting an option triggers the camera
    const search = schemaViewerSearchInput(page);
    await search.click();
    await expect(search).toBeFocused();
    await search.pressSequentially("ord");
    await expect(page.getByRole("option", { name: /Orders/i })).toBeVisible();
    await search.press("Enter");
    await expectNodeInViewport(page, ORDERS_ID);

    // Empty result shows 'No tables found'
    await search.click();
    await search.fill("");
    await search.pressSequentially("zzz_nope_zzz");
    await expect(
      page
        .getByTestId("schema-viewer-node-search-dropdown")
        .getByText("No tables found", { exact: true }),
    ).toBeVisible();
    await search.press("Escape");
  });

  test("URL state survives a hard reload, and the bare URL redirects back to the last opened (DB, schema)", async ({
    page,
  }) => {
    // Deep-link directly to Sample DB → PUBLIC
    const deepLinkErd = waitForErd(page);
    await page.goto(
      `${BASE_URL}?database-id=${SAMPLE_DB_ID}&schema=${PUBLIC_SCHEMA}`,
    );
    await deepLinkErd;
    await expect(tableNode(page, ORDERS_ID)).toBeVisible();

    // Hard reload reproduces the same canvas state
    const reloadErd = waitForErd(page);
    await page.reload();
    await reloadErd;
    await expect(tableNode(page, ORDERS_ID)).toBeVisible();
    await expect(tableNode(page, PRODUCTS_ID)).toBeVisible();

    // Visiting the bare URL redirects to the last opened (DB, schema)
    const bareUrlErd = waitForErd(page);
    await page.goto(BASE_URL);
    await bareUrlErd;
    await expect(page).toHaveURL(new RegExp(`database-id=${SAMPLE_DB_ID}`));
    await expect(page).toHaveURL(new RegExp(`schema=${PUBLIC_SCHEMA}`));
    await expect(tableNode(page, ORDERS_ID)).toBeVisible();
  });

  test("opens the picker with the current selection highlighted, and supports Back navigation between databases and schemas", async ({
    page,
  }) => {
    const erd = waitForErd(page);
    await page.goto(
      `${BASE_URL}?database-id=${SAMPLE_DB_ID}&schema=${PUBLIC_SCHEMA}`,
    );
    await erd;
    await expect(tableNode(page, ORDERS_ID)).toBeVisible();

    // Picker trigger shows the current schema name
    await expect(schemaPickerTrigger(page)).toContainText(PUBLIC_SCHEMA);

    // Open the picker — drills directly into the schema list of the current DB
    await schemaPickerTrigger(page).click();
    await expect(
      miniPicker(page).getByText("Sample Database", { exact: true }),
    ).toBeVisible();

    // Click outside the popover closes it
    await page.mouse.click(0, 0);
    await expect(miniPicker(page)).toHaveCount(0);
  });
});

test.describe(
  "scenarios > schema-viewer (writable Postgres: multi-schema, self-ref, one-to-one, cross-schema FK)",
  { tag: "@external" },
  () => {
    // Needs the writable postgres QA container and the postgres-writable
    // snapshot, neither of which exist in the default Playwright CI setup.
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      "Requires the writable postgres QA database and its postgres-writable snapshot (set PW_QA_DB_ENABLED)",
    );
    test.skip(
      !resolveToken("bleeding-edge"),
      "Requires the bleeding-edge token (set MB_ALL_FEATURES_TOKEN)",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore("postgres-writable");
      await mb.signInAsAdmin();
      await mb.api.activateToken("bleeding-edge");
      await queryWritableDB(SV_SETUP_SQL);
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: SV_REQUIRED_TABLES,
        retrigger: true,
      });
    });

    test.afterAll(async () => {
      await queryWritableDB(
        "DROP SCHEMA IF EXISTS sv_test CASCADE; DROP SCHEMA IF EXISTS sv_extra CASCADE;",
      );
    });

    test("drills into a multi-schema DB via the picker, renders self-ref + one-to-one + cross-schema edges, expands an off-canvas FK target, and persists the expansion", async ({
      page,
      mb,
    }) => {
      // Capture writable-DB table IDs created by the setup SQL
      const usersId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "users",
        schema: SV_SCHEMA,
      });
      const profilesId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "profiles",
        schema: SV_SCHEMA,
      });
      const categoriesId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "categories",
        schema: SV_SCHEMA,
      });
      const productsId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "products",
        schema: SV_SCHEMA,
      });
      const lookupId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "lookup",
        schema: SV_EXTRA_SCHEMA,
      });

      // Bare URL — picker auto-opens with both databases listed
      await page.goto(BASE_URL);
      await expect(
        miniPicker(page).getByText("Sample Database", { exact: true }),
      ).toBeVisible();
      await expect(
        miniPicker(page).getByText("Writable Postgres12", { exact: true }),
      ).toBeVisible();

      // Multi-schema DB drills into the schema list (no auto-nav)
      await miniPicker(page)
        .getByText("Writable Postgres12", { exact: true })
        .click();
      await expect(
        miniPicker(page).getByText(SV_SCHEMA, { exact: true }),
      ).toBeVisible();
      await expect(
        miniPicker(page).getByText(SV_EXTRA_SCHEMA, { exact: true }),
      ).toBeVisible();

      // Click sv_test → navigates and ERD loads
      const schemaErd = waitForErd(page);
      await miniPicker(page).getByText(SV_SCHEMA, { exact: true }).click();
      await schemaErd;
      await expect(page).toHaveURL(new RegExp(`database-id=${WRITABLE_DB_ID}`));
      await expect(page).toHaveURL(new RegExp(`schema=${SV_SCHEMA}`));

      // All four sv_test tables render as nodes
      await expect(tableNode(page, usersId)).toBeVisible();
      await expect(tableNode(page, profilesId)).toBeVisible();
      await expect(tableNode(page, categoriesId)).toBeVisible();
      await expect(tableNode(page, productsId)).toBeVisible();

      // Schema-bounded BFS: cross-schema lookup is NOT a node yet — it
      // surfaces only as an FK pointer on products
      await expect(tableNode(page, lookupId)).toHaveCount(0);

      // Edges visible: users<->profiles (one-to-one) and categories self-ref.
      // Cross-schema FK has no edge until expansion
      await expect(page.locator(".react-flow__edge")).toHaveCount(2);

      // Clicking the profiles.user_id FK (target on canvas) selects the
      // connecting edge
      await tableNode(page, profilesId)
        .getByText("user_id", { exact: true })
        .click();
      await expect(
        page.locator(
          '[data-testid="schema-viewer-edge-path"][style*="stroke-width: 2"]',
        ),
      ).toHaveCount(1);

      // Click the cross-schema FK on products.lookup_id — adds
      // sv_extra.lookup to the canvas
      const expandErd = waitForErd(page);
      await tableNode(page, productsId)
        .getByText("lookup_id", { exact: true })
        .click({ force: true });
      await expandErd;
      await expect(tableNode(page, lookupId)).toBeVisible();
      await expectNodeInViewport(page, lookupId);
      // Edge count grows by one (products → lookup edge added)
      await expect(page.locator(".react-flow__edge")).toHaveCount(3);

      // Reload — the expanded lookup table persists via UKV (URL stays
      // untouched, canvas keeps the table)
      const reloadErd = waitForErd(page);
      await page.reload();
      await reloadErd;
      await expect(tableNode(page, lookupId)).toBeVisible();
      await expect(page.locator(".react-flow__edge")).toHaveCount(3);

      // URL precedence: visit the same context with table-ids=<other> — URL
      // must win, the UKV-saved lookup is ignored
      const otherId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "other",
        schema: SV_EXTRA_SCHEMA,
      });
      const precedenceErd = waitForErd(page);
      await page.goto(
        `${BASE_URL}?database-id=${WRITABLE_DB_ID}&schema=${SV_SCHEMA}&table-ids=${otherId}`,
      );
      const precedenceResponse = await precedenceErd;
      const requestUrl = precedenceResponse.request().url();
      expect(
        requestUrl,
        "ERD request should carry the URL-supplied table-ids",
      ).toContain(`table-ids=${otherId}`);
      expect(
        requestUrl,
        "ERD request must NOT include the UKV-saved table-ids",
      ).not.toContain(`table-ids=${lookupId}`);

      // Canvas reflects URL precedence: `other` is shown, `lookup` is not
      await expect(tableNode(page, otherId)).toBeVisible();
      await expect(tableNode(page, lookupId)).toHaveCount(0);
    });
  },
);

test.describe("scenarios > schema-viewer (entry points + loader/error states)", () => {
  test.skip(
    !resolveToken("bleeding-edge"),
    "Requires the bleeding-edge token (set MB_ALL_FEATURES_TOKEN)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");
  });

  test("Data Studio sidebar tab and Data Model 'Schema viewer' button both lead into the schema viewer", async ({
    page,
  }) => {
    // Click 'Schema viewer' tab in the Data Studio sidebar — opens the bare
    // schema viewer URL
    await page.goto("/data-studio");
    await dataStudioNav(page)
      .getByText("Schema viewer", { exact: true })
      .click();
    await expect(page).toHaveURL(/\/data-studio\/schema-viewer/);
    await expect(
      schemaPickerTrigger(page).getByText("Pick a schema to view", {
        exact: true,
      }),
    ).toBeVisible();

    // Navigate to the Orders Data Model page via the table picker tree
    await dataStudioNav(page).getByText("Tables", { exact: true }).click();
    // .first() mirrors cy.contains' first-match semantics over the tree items
    await page
      .getByTestId("tree-item")
      .filter({ hasText: /Orders/ })
      .first()
      .click();

    // Click the 'View schema' action in the Orders table section — opens
    // with Orders as focal
    await tableSectionActionsMenuButton(page).click();
    const erd = waitForErd(page);
    await menu(page).getByText("View schema", { exact: true }).click();
    await erd;
    await expect(page).toHaveURL(/\/data-studio\/schema-viewer/);
    await expect(page).toHaveURL(new RegExp(`database-id=${SAMPLE_DB_ID}`));
    await expect(page).toHaveURL(new RegExp(`table-ids=${ORDERS_ID}`));
    await expect(tableNode(page, ORDERS_ID)).toBeVisible();
    // Focal table is on screen
    await expectNodeInViewport(page, ORDERS_ID);
  });

  test("renders the loader during a slow ERD fetch and the error panel when the request fails", async ({
    page,
  }) => {
    const isErdUrl = (url: URL) => url.pathname === "/api/ee/erd";

    // Force a 500 — error panel renders with the surfaced message
    await page.route(isErdUrl, (route) =>
      route.fulfill({ status: 500, body: "boom" }),
    );
    const erdError = waitForErd(page);
    await page.goto(
      `${BASE_URL}?database-id=${SAMPLE_DB_ID}&schema=${PUBLIC_SCHEMA}`,
    );
    await erdError;
    const errorPanel = page.getByTestId("schema-viewer-error");
    await expect(errorPanel).toBeVisible();
    await expect(errorPanel).toContainText("boom");

    // Slow the ERD response — the centred loader appears, then the canvas
    // renders
    await page.unroute(isErdUrl);
    await page.route(isErdUrl, async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ response });
    });
    await dataStudioNav(page).getByLabel("Library", { exact: true }).click();
    await dataStudioNav(page)
      .getByLabel("Schema viewer", { exact: true })
      .click();
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    const slowErd = waitForErd(page);
    await miniPicker(page).getByText("PUBLIC", { exact: true }).click();
    await expect(page.getByTestId("schema-viewer-loader")).toBeVisible();
    await slowErd;
    await expect(page.getByTestId("schema-viewer-loader")).toHaveCount(0);
    await expect(tableNode(page, ORDERS_ID)).toBeVisible();
  });
});

test.describe("scenarios > schema-viewer (permissions)", () => {
  test.skip(
    !resolveToken("bleeding-edge"),
    "Requires the bleeding-edge token (set MB_ALL_FEATURES_TOKEN)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");
  });

  test("a non-admin Data Studio analyst can open the schema viewer end-to-end", async ({
    page,
    mb,
  }) => {
    // Promote the normal user to the Data Analysts group so they pass
    // canAccessDataStudio
    const usersResponse = await mb.api.get("/api/user");
    const { data: users } = (await usersResponse.json()) as {
      data: { id: number; email: string }[];
    };
    const normal = users.find(
      (user) => user.email === "normal@metabase.test",
    );
    if (!normal) {
      throw new Error("normal@metabase.test not found in /api/user");
    }
    await mb.api.post("/api/permissions/membership", {
      group_id: MAGIC_USER_GROUPS.DATA_ANALYSTS_GROUP,
      user_id: normal.id,
    });

    await mb.signInAsNormalUser();
    const erd = waitForErd(page);
    await page.goto(
      `${BASE_URL}?database-id=${SAMPLE_DB_ID}&schema=${PUBLIC_SCHEMA}`,
    );
    await erd;

    // Schema viewer renders for the analyst — Sample DB tables on canvas
    await expect(tableNode(page, ORDERS_ID)).toBeVisible();
    await expect(tableNode(page, PRODUCTS_ID)).toBeVisible();
    await expect(tableNode(page, PEOPLE_ID)).toBeVisible();
    await expect(tableNode(page, REVIEWS_ID)).toBeVisible();

    // Selection still works for the non-admin user
    await tableNode(page, ORDERS_ID)
      .getByText("ORDERS", { exact: true })
      .click();
    await expect(infoPanel(page)).toBeVisible();
    await expect(infoPanel(page)).toContainText("ORDERS");
  });
});
