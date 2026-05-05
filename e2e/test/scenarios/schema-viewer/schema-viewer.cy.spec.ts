const { H } = cy;

import {
  MAGIC_USER_GROUPS,
  SAMPLE_DB_ID,
  SAMPLE_DB_TABLES,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";

const {
  STATIC_ORDERS_ID: ORDERS_ID,
  STATIC_PEOPLE_ID: PEOPLE_ID,
  STATIC_PRODUCTS_ID: PRODUCTS_ID,
  STATIC_REVIEWS_ID: REVIEWS_ID,
} = SAMPLE_DB_TABLES;

const BASE_URL = "/data-studio/schema-viewer";
const PUBLIC_SCHEMA = "PUBLIC";
const ERD_ALIAS = "erd";

// Layout constants mirrored from the SchemaViewer source. Keep in sync.
const AUTO_LAYOUT_ZOOM = 0.3;
const MIN_FOCUS_ZOOM = 0.5;

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

const tableNode = (tableId: number) => cy.get(`[data-id="table-${tableId}"]`);
const schemaPickerTrigger = () => cy.findByTestId("schema-picker-button");
const searchInput = () => cy.findByTestId("schema-viewer-node-search-input");
const infoPanel = () => cy.findByTestId("graph-info-panel");
const reactFlowViewport = () => cy.get(".react-flow__viewport");

function assertViewportZoom(matcher: (zoom: number) => void) {
  // `should()` retries until the camera animation settles; `then()` would
  // run once and capture a mid-animation transform.
  reactFlowViewport().should(($el) => {
    const style = $el.attr("style") ?? "";
    const m = /scale\(([\d.]+)\)/.exec(style);
    expect(m, `viewport transform should contain scale(...): ${style}`).to.not
      .be.null;
    matcher(parseFloat(m![1]));
  });
}

function assertNodeInViewport(tableId: number) {
  // Use `should()` so the assertion retries until the camera animation
  // settles — `then()` would run once and capture the mid-animation rect.
  cy.get(".react-flow").should(($rf) => {
    const v = $rf[0].getBoundingClientRect();
    const $n = Cypress.$(`[data-id="table-${tableId}"]`);
    expect(
      $n.length,
      `table-${tableId} should be in the DOM`,
    ).to.be.greaterThan(0);
    const n = $n[0].getBoundingClientRect();
    const overlaps =
      n.right > v.left &&
      n.left < v.right &&
      n.bottom > v.top &&
      n.top < v.bottom;
    expect(
      overlaps,
      `table-${tableId} bounding rect should overlap the React Flow viewport`,
    ).to.be.true;
  });
}

describe("scenarios > schema-viewer (premium gating)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/ee/erd*").as(ERD_ALIAS);
  });

  it("renders the upsell page and never calls the ERD endpoint when :dependencies is not licensed", () => {
    cy.log("Visit the schema viewer URL without activating a token");
    cy.visit(BASE_URL);

    cy.log("Upsell page is shown");
    cy.findByRole("heading", {
      name: "Visualize your database structure",
    }).should("be.visible");

    cy.log("ERD endpoint was never called");
    cy.get(`@${ERD_ALIAS}.all`).should("have.length", 0);
  });
});

describe("scenarios > schema-viewer (Sample Database happy path)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.intercept("GET", "/api/ee/erd*").as(ERD_ALIAS);
  });

  it("walks the full picker → canvas → selection → info panel → search → layout flow on the Sample Database", () => {
    cy.log("Bare URL renders the empty state with the picker auto-opened");
    cy.visit(BASE_URL);
    cy.findByTestId("schema-viewer-empty-state")
      .findByText("Pick a database to view its schema")
      .should("be.visible");

    cy.log("Pick the Sample Database from the picker");
    cy.findByRole("button", { name: "Sample Database" }).click();

    cy.log("Single-schema DB auto-navigates into PUBLIC and fetches ERD");
    cy.wait(`@${ERD_ALIAS}`)
      .its("request.url")
      .should("include", `database-id=${SAMPLE_DB_ID}`)
      .and("include", `schema=${PUBLIC_SCHEMA}`);
    cy.url().should("include", `database-id=${SAMPLE_DB_ID}`);
    cy.url().should("include", `schema=${PUBLIC_SCHEMA}`);

    cy.log("All four FK-connected sample tables render as nodes");
    tableNode(ORDERS_ID).should("be.visible");
    tableNode(PRODUCTS_ID).should("be.visible");
    tableNode(PEOPLE_ID).should("be.visible");
    tableNode(REVIEWS_ID).should("be.visible");

    cy.log("Edges are rendered between FK-related tables");
    cy.get(".react-flow__edge").should("have.length.at.least", 3);

    cy.log("Click the Orders table header to select the node");
    tableNode(ORDERS_ID).findByText("ORDERS").click();

    cy.log("Side info panel opens with the table breadcrumb and field list");
    infoPanel()
      .should("be.visible")
      .and("contain", "Orders")
      .and("contain", "User ID")
      .and("contain", "Product ID");

    cy.log("Read-only adapter: no 'Find and replace' / 'Replace' button");
    infoPanel()
      .findByRole("button", { name: /Replace/i })
      .should("not.exist");

    cy.log("Click panel title — camera re-zooms to the selected Orders node");
    infoPanel().findByRole("heading", { name: "Orders" }).click();
    assertViewportZoom((z) =>
      expect(z, "title click should zoom in (>= 0.5)").to.be.at.least(
        MIN_FOCUS_ZOOM,
      ),
    );
    assertNodeInViewport(ORDERS_ID);

    cy.log(
      "Click an FK link inside the info panel — camera pans to the target",
    );
    infoPanel()
      .findByRole("button", { name: /Products/i })
      .click();
    assertNodeInViewport(PRODUCTS_ID);
    cy.log("Selection stays on Orders after FK link click");
    infoPanel().findByRole("heading", { name: "Orders" }).should("be.visible");

    cy.log("Auto-layout fits the entire canvas — every table is on screen");
    cy.contains("button", "Auto-layout").should("be.visible").click();
    assertNodeInViewport(ORDERS_ID);
    assertNodeInViewport(PRODUCTS_ID);
    assertNodeInViewport(PEOPLE_ID);
    assertNodeInViewport(REVIEWS_ID);
    cy.log("Auto-layout zoom is within React Flow's clamp range (>= MIN_ZOOM)");
    assertViewportZoom((z) =>
      expect(z, "auto-layout zoom should be at least MIN_ZOOM").to.be.at.least(
        AUTO_LAYOUT_ZOOM,
      ),
    );

    cy.log("Re-select Orders, then Focus-node zooms in (>= 0.5) onto Orders");
    tableNode(ORDERS_ID).findByText("ORDERS").click();
    cy.contains("button", "Focus node").should("be.visible").click();
    assertViewportZoom((z) =>
      expect(z, "focus-node zoom should be at least 0.5").to.be.at.least(
        MIN_FOCUS_ZOOM,
      ),
    );
    assertNodeInViewport(ORDERS_ID);

    cy.log(
      "After focusing the same node, the button stays disabled until selection changes",
    );
    cy.contains("button", "Focus node").should("be.disabled");

    cy.log(
      "Double-click Reviews — camera zooms in (>= 0.5) onto Reviews and re-enables the focus-node button",
    );
    tableNode(REVIEWS_ID).findByText("REVIEWS").dblclick();
    assertViewportZoom((z) =>
      expect(z, "double-click should zoom in (>= 0.5)").to.be.at.least(
        MIN_FOCUS_ZOOM,
      ),
    );
    assertNodeInViewport(REVIEWS_ID);
    cy.contains("button", "Focus node").should("not.be.disabled");

    cy.log("Selection moved from Orders to Reviews — prior selection cleared");
    infoPanel().findByRole("heading", { name: "Reviews" }).should("be.visible");
    infoPanel().findByRole("heading", { name: "Orders" }).should("not.exist");

    cy.log(
      "Clicking the USER_ID FK on Orders (target on canvas) selects the connecting edge and pans the camera",
    );
    // `{ force: true }` skips the overlap check — the info panel sits over the
    // right of the canvas, but the row is still in the DOM and clickable.
    tableNode(ORDERS_ID).findByText("USER_ID").click({ force: true });
    assertNodeInViewport(PEOPLE_ID);
    cy.findAllByTestId("schema-viewer-edge-path")
      .filter('[style*="stroke-width: 2"]')
      .should("have.length", 1);

    cy.log(
      "Re-clicking the now-selected edge alternates the camera between source and target endpoints",
    );
    const selectedEdge = () => cy.get(".react-flow__edge.selected");
    selectedEdge().click({ force: true });
    reactFlowViewport().invoke("attr", "style").as("zoomToSourceEnd");
    selectedEdge().click({ force: true });
    cy.get<string>("@zoomToSourceEnd").then((sourceTransform) => {
      reactFlowViewport()
        .invoke("attr", "style")
        .should((style) =>
          expect(
            style,
            "next click on the same edge should zoom to the OTHER endpoint",
          ).to.not.equal(sourceTransform),
        );
    });

    cy.log(
      "Search input filters by name; selecting an option triggers the camera",
    );
    searchInput().click().should("be.focused").type("ord");
    cy.findByRole("option", { name: /Orders/i }).should("be.visible");
    searchInput().type("{enter}");
    assertNodeInViewport(ORDERS_ID);

    cy.log("Empty result shows 'No tables found'");
    searchInput().click().clear().type("zzz_nope_zzz");
    cy.findByTestId("schema-viewer-node-search-dropdown")
      .findByText("No tables found")
      .should("be.visible");
    searchInput().type("{esc}");

    cy.log("Closing the info panel clears node selection");
    infoPanel().findByLabelText("Close").click({ force: true });
    cy.findByTestId("graph-info-panel").should("not.exist");
    cy.contains("button", "Focus node").should("not.exist");

    cy.log("Legacy /api/ee/dependencies/erd URL is fully decommissioned (404)");
    cy.request({
      url: "/api/ee/dependencies/erd?database-id=1&schema=PUBLIC",
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 404);
  });

  it("URL state survives a hard reload, and the bare URL redirects back to the last opened (DB, schema)", () => {
    cy.log("Deep-link directly to Sample DB → PUBLIC");
    cy.visit(`${BASE_URL}?database-id=${SAMPLE_DB_ID}&schema=${PUBLIC_SCHEMA}`);
    cy.wait(`@${ERD_ALIAS}`);
    tableNode(ORDERS_ID).should("be.visible");

    cy.log("Hard reload reproduces the same canvas state");
    cy.reload();
    cy.wait(`@${ERD_ALIAS}`);
    tableNode(ORDERS_ID).should("be.visible");
    tableNode(PRODUCTS_ID).should("be.visible");

    cy.log("Visiting the bare URL redirects to the last opened (DB, schema)");
    cy.visit(BASE_URL);
    cy.wait(`@${ERD_ALIAS}`);
    cy.url()
      .should("include", `database-id=${SAMPLE_DB_ID}`)
      .and("include", `schema=${PUBLIC_SCHEMA}`);
    tableNode(ORDERS_ID).should("be.visible");
  });

  it("opens the picker with the current selection highlighted, and supports Back navigation between databases and schemas", () => {
    cy.visit(`${BASE_URL}?database-id=${SAMPLE_DB_ID}&schema=${PUBLIC_SCHEMA}`);
    cy.wait(`@${ERD_ALIAS}`);
    tableNode(ORDERS_ID).should("be.visible");

    cy.log("Picker trigger shows the current schema name");
    schemaPickerTrigger().should("contain", PUBLIC_SCHEMA);

    cy.log(
      "Open the picker — drills directly into the schema list of the current DB",
    );
    schemaPickerTrigger().click();
    cy.findByLabelText("Back to databases").should("be.visible");

    cy.log("Back button returns to the database list");
    cy.findByLabelText("Back to databases").click();
    cy.findByLabelText("Sample Database").should("be.visible");

    cy.log("Click outside the popover closes it");
    cy.get("body").click(0, 0);
    cy.findByLabelText("Sample Database").should("not.exist");
  });
});

describe("scenarios > schema-viewer (writable Postgres: multi-schema, self-ref, one-to-one, cross-schema FK)", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.intercept("GET", "/api/ee/erd*").as(ERD_ALIAS);
    H.queryWritableDB(SV_SETUP_SQL, "postgres");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
  });

  it("drills into a multi-schema DB via the picker, renders self-ref + one-to-one + cross-schema edges, expands an off-canvas FK target, and persists the expansion", () => {
    cy.log("Capture writable-DB table IDs created by the setup SQL");
    H.getTableId({
      databaseId: WRITABLE_DB_ID,
      name: "users",
      schema: SV_SCHEMA,
    }).as("usersId");
    H.getTableId({
      databaseId: WRITABLE_DB_ID,
      name: "profiles",
      schema: SV_SCHEMA,
    }).as("profilesId");
    H.getTableId({
      databaseId: WRITABLE_DB_ID,
      name: "categories",
      schema: SV_SCHEMA,
    }).as("categoriesId");
    H.getTableId({
      databaseId: WRITABLE_DB_ID,
      name: "products",
      schema: SV_SCHEMA,
    }).as("productsId");
    H.getTableId({
      databaseId: WRITABLE_DB_ID,
      name: "lookup",
      schema: SV_EXTRA_SCHEMA,
    }).as("lookupId");

    cy.log("Bare URL — picker auto-opens with both databases listed");
    cy.visit(BASE_URL);
    cy.findByLabelText("Sample Database").should("be.visible");
    cy.findByLabelText("Writable Postgres12").should("be.visible");

    cy.log("Multi-schema DB drills into the schema list (no auto-nav)");
    cy.findByLabelText("Writable Postgres12").click();
    cy.findByLabelText("Back to databases").should("be.visible");
    cy.findByLabelText(SV_SCHEMA).should("be.visible");
    cy.findByLabelText(SV_EXTRA_SCHEMA).should("be.visible");

    cy.log(`Click ${SV_SCHEMA} → navigates and ERD loads`);
    cy.findByLabelText(SV_SCHEMA).click();
    cy.wait(`@${ERD_ALIAS}`);
    cy.url()
      .should("include", `database-id=${WRITABLE_DB_ID}`)
      .and("include", `schema=${SV_SCHEMA}`);

    cy.log("All four sv_test tables render as nodes");
    cy.get<number>("@usersId").then((id) => tableNode(id).should("be.visible"));
    cy.get<number>("@profilesId").then((id) =>
      tableNode(id).should("be.visible"),
    );
    cy.get<number>("@categoriesId").then((id) =>
      tableNode(id).should("be.visible"),
    );
    cy.get<number>("@productsId").then((id) =>
      tableNode(id).should("be.visible"),
    );

    cy.log(
      "Schema-bounded BFS: cross-schema lookup is NOT a node yet — it surfaces only as an FK pointer on products",
    );
    cy.get<number>("@lookupId").then((id) =>
      cy.get(`[data-id="table-${id}"]`).should("not.exist"),
    );

    cy.log(
      "Edges visible: users<->profiles (one-to-one) and categories self-ref. Cross-schema FK has no edge until expansion",
    );
    cy.get(".react-flow__edge").should("have.length", 2);

    cy.log(
      "Clicking the profiles.user_id FK (target on canvas) selects the connecting edge",
    );
    cy.get<number>("@profilesId").then((id) =>
      tableNode(id).findByText("user_id").click(),
    );
    cy.findAllByTestId("schema-viewer-edge-path")
      .filter('[style*="stroke-width: 2"]')
      .should("have.length", 1);

    cy.log(
      "Click the cross-schema FK on products.lookup_id — adds sv_extra.lookup to the canvas",
    );
    cy.get<number>("@productsId").then((id) =>
      tableNode(id).findByText("lookup_id").click({ force: true }),
    );
    cy.wait(`@${ERD_ALIAS}`);
    cy.get<number>("@lookupId").then((id) => {
      tableNode(id).should("be.visible");
      assertNodeInViewport(id);
    });
    cy.log("Edge count grows by one (products → lookup edge added)");
    cy.get(".react-flow__edge").should("have.length", 3);

    cy.log(
      "Reload — the expanded lookup table persists via UKV (URL stays untouched, canvas keeps the table)",
    );
    cy.reload();
    cy.wait(`@${ERD_ALIAS}`);
    cy.get<number>("@lookupId").then((id) => {
      tableNode(id).should("be.visible");
    });
    cy.get(".react-flow__edge").should("have.length", 3);

    cy.log(
      "URL precedence: visit the same context with table-ids=<other> — URL must win, the UKV-saved lookup is ignored",
    );
    H.getTableId({
      databaseId: WRITABLE_DB_ID,
      name: "other",
      schema: SV_EXTRA_SCHEMA,
    }).as("otherId");
    cy.get<number>("@otherId").then((otherId) => {
      cy.visit(
        `${BASE_URL}?database-id=${WRITABLE_DB_ID}&schema=${SV_SCHEMA}&table-ids=${otherId}`,
      );
    });
    cy.wait(`@${ERD_ALIAS}`).then(({ request }) => {
      cy.get<number>("@otherId").then((otherId) => {
        expect(
          request.url,
          "ERD request should carry the URL-supplied table-ids",
        ).to.include(`table-ids=${otherId}`);
      });
      cy.get<number>("@lookupId").then((lookupId) => {
        expect(
          request.url,
          "ERD request must NOT include the UKV-saved table-ids",
        ).to.not.include(`table-ids=${lookupId}`);
      });
    });
    cy.log("Canvas reflects URL precedence: `other` is shown, `lookup` is not");
    cy.get<number>("@otherId").then((id) => tableNode(id).should("be.visible"));
    cy.get<number>("@lookupId").then((id) =>
      cy.get(`[data-id="table-${id}"]`).should("not.exist"),
    );
  });
});

describe("scenarios > schema-viewer (entry points + loader/error states)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("Data Studio sidebar tab and Data Model 'Schema viewer' button both lead into the schema viewer", () => {
    cy.intercept("GET", "/api/ee/erd*").as(ERD_ALIAS);

    cy.log(
      "Click 'Schema viewer' tab in the Data Studio sidebar — opens the bare schema viewer URL",
    );
    cy.visit("/data-studio");
    H.DataStudio.nav().findByText("Schema viewer").click();
    cy.url().should("include", "/data-studio/schema-viewer");
    cy.findByTestId("schema-viewer-empty-state")
      .findByText("Pick a database to view its schema")
      .should("be.visible");

    cy.log("Navigate directly to the Orders Data Model page");
    cy.visit(
      `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_ID}%3APUBLIC/table/${ORDERS_ID}`,
    );

    cy.log(
      "Click the 'Schema viewer' button in the Orders table section — opens with Orders as focal",
    );
    cy.findByTestId("table-section").findByLabelText("Schema viewer").click();
    cy.wait(`@${ERD_ALIAS}`);
    cy.url()
      .should("include", "/data-studio/schema-viewer")
      .and("include", `database-id=${SAMPLE_DB_ID}`)
      .and("include", `table-ids=${ORDERS_ID}`);
    tableNode(ORDERS_ID).should("be.visible");
    cy.log("Focal table is on screen");
    assertNodeInViewport(ORDERS_ID);
  });

  it("renders the loader during a slow ERD fetch and the error panel when the request fails", () => {
    cy.log(
      "Slow the ERD response — the centred loader appears, then the canvas renders",
    );
    cy.intercept("GET", "/api/ee/erd*", (req) => {
      req.on("response", (res) => {
        res.setDelay(1500);
      });
    }).as("slowErd");
    cy.visit(`${BASE_URL}?database-id=${SAMPLE_DB_ID}&schema=${PUBLIC_SCHEMA}`);
    cy.findByTestId("schema-viewer-loader").should("be.visible");
    cy.wait("@slowErd");
    cy.findByTestId("schema-viewer-loader").should("not.exist");
    tableNode(ORDERS_ID).should("be.visible");

    cy.log("Force a 500 — error panel renders with the surfaced message");
    cy.intercept("GET", "/api/ee/erd*", { statusCode: 500, body: "boom" }).as(
      "erdError",
    );
    cy.reload();
    cy.wait("@erdError");
    cy.findByTestId("schema-viewer-error").should("be.visible");
  });
});

describe("scenarios > schema-viewer (permissions)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("a non-admin Data Studio analyst can open the schema viewer end-to-end", () => {
    cy.log(
      "Promote the normal user to the Data Analysts group so they pass canAccessDataStudio",
    );
    cy.request("GET", "/api/user").then(({ body }) => {
      const normal = body.data.find(
        (u: { email: string }) => u.email === "normal@metabase.test",
      );
      cy.request("POST", "/api/permissions/membership", {
        group_id: MAGIC_USER_GROUPS.DATA_ANALYSTS_GROUP,
        user_id: normal.id,
      });
    });

    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/ee/erd*").as(ERD_ALIAS);
    cy.visit(`${BASE_URL}?database-id=${SAMPLE_DB_ID}&schema=${PUBLIC_SCHEMA}`);
    cy.wait(`@${ERD_ALIAS}`);

    cy.log(
      "Schema viewer renders for the analyst — Sample DB tables on canvas",
    );
    tableNode(ORDERS_ID).should("be.visible");
    tableNode(PRODUCTS_ID).should("be.visible");
    tableNode(PEOPLE_ID).should("be.visible");
    tableNode(REVIEWS_ID).should("be.visible");

    cy.log("Selection still works for the non-admin user");
    tableNode(ORDERS_ID).findByText("ORDERS").click();
    infoPanel().should("be.visible").and("contain", "Orders");
  });
});
