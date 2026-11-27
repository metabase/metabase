const { H } = cy;

import {
  MAGIC_USER_GROUPS,
  SAMPLE_DB_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { TableId } from "metabase-types/api";

const { ORDERS_ID, PEOPLE_ID, PRODUCTS_ID, REVIEWS_ID } = SAMPLE_DATABASE;

const BASE_URL = "/data-studio/schema-viewer";
const PUBLIC_SCHEMA = "PUBLIC";
const ERD_ALIAS = "erd";

const SV_SCHEMA = "sv_test";
const SV_EXTRA_SCHEMA = "sv_extra";

// Postgres setup creating two schemas and a few tables that exercise
// scenarios the Sample Database doesn't naturally cover:
//  - sv_test.users / sv_test.profiles → one-to-one (shared PK)
//  - sv_test.categories.parent_id → categories.id (self-reference)
//  - sv_test.products.lookup_id → sv_extra.lookup.id (cross-schema FK)
const SV_SETUP_SQL = `
  DROP SCHEMA IF EXISTS sv_test CASCADE;
  DROP SCHEMA IF EXISTS sv_extra CASCADE;
  CREATE SCHEMA sv_extra;
  CREATE SCHEMA sv_test;
  CREATE TABLE sv_extra.lookup (
    id SERIAL PRIMARY KEY,
    code TEXT
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
];

const tableNode = (tableId: TableId) => cy.get(`[data-id="table-${tableId}"]`);
const schemaPickerTrigger = () => cy.findByTestId("schema-picker-button");
const infoPanel = () => cy.findByTestId("graph-info-panel");

describe("scenarios > schema-viewer (Sample Database happy path)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.intercept("GET", "/api/ee/erd*").as(ERD_ALIAS);
  });

  it("picks the Sample Database, renders its tables and the info panel from the real ERD, then keeps the context across a reload and a bare-URL visit", () => {
    cy.log("Bare URL renders the empty state with the picker auto-opened");
    cy.visit(BASE_URL);
    cy.findByTestId("schema-picker-button")
      .findByText("Pick a schema to view")
      .should("be.visible");

    cy.log("Pick the Sample Database from the picker");
    H.miniPicker().findByText("Sample Database").click();
    H.miniPicker().findByText("PUBLIC").click();

    cy.wait("@erd")
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
      .and("contain", "ORDERS")
      .and("contain", "Sample Database")
      .and("contain", "PUBLIC")
      .and("contain", "USER_ID")
      .and("contain", "PEOPLE");

    cy.log("Hard reload reproduces the same canvas state");
    cy.reload();
    cy.wait("@erd");
    tableNode(ORDERS_ID).should("be.visible");
    tableNode(PRODUCTS_ID).should("be.visible");

    cy.log("Visiting the bare URL redirects to the last opened (DB, schema)");
    cy.visit(BASE_URL);
    cy.wait("@erd");
    cy.url()
      .should("include", `database-id=${SAMPLE_DB_ID}`)
      .and("include", `schema=${PUBLIC_SCHEMA}`);
    tableNode(ORDERS_ID).should("be.visible");
    schemaPickerTrigger().should("contain", PUBLIC_SCHEMA);
  });
});

describe("scenarios > schema-viewer (writable Postgres: multi-schema, self-ref, one-to-one, cross-schema FK)", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.intercept("GET", "/api/ee/erd*").as(ERD_ALIAS);
    H.queryWritableDB(SV_SETUP_SQL, "postgres");
    H.resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tables: SV_REQUIRED_TABLES,
      retrigger: true,
    });
  });

  after(() => {
    H.queryWritableDB(
      "DROP SCHEMA IF EXISTS sv_test CASCADE; DROP SCHEMA IF EXISTS sv_extra CASCADE;",
      "postgres",
    );
  });

  it("drills into a multi-schema DB via the picker, renders the edges the backend returns, expands an off-canvas FK target, and persists the expansion", () => {
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
    H.miniPicker().findByText("Sample Database").should("be.visible");
    H.miniPicker().findByText("Writable Postgres12").should("be.visible");

    cy.log("Multi-schema DB drills into the schema list (no auto-nav)");
    H.miniPicker().findByText("Writable Postgres12").click();
    H.miniPicker().findByText(SV_SCHEMA).should("be.visible");
    H.miniPicker().findByText(SV_EXTRA_SCHEMA).should("be.visible");

    cy.log(`Click ${SV_SCHEMA} → navigates and ERD loads`);
    H.miniPicker().findByText(SV_SCHEMA).click();
    cy.wait("@erd");
    cy.url()
      .should("include", `database-id=${WRITABLE_DB_ID}`)
      .and("include", `schema=${SV_SCHEMA}`);

    cy.log("All four sv_test tables render as nodes");
    cy.get<TableId>("@usersId").then((id) =>
      tableNode(id).should("be.visible"),
    );
    cy.get<TableId>("@profilesId").then((id) =>
      tableNode(id).should("be.visible"),
    );
    cy.get<TableId>("@categoriesId").then((id) =>
      tableNode(id).should("be.visible"),
    );
    cy.get<TableId>("@productsId").then((id) =>
      tableNode(id).should("be.visible"),
    );

    cy.log(
      "Schema-bounded BFS: cross-schema lookup is NOT a node yet — it surfaces only as an FK pointer on products",
    );
    cy.get<TableId>("@lookupId").then((id) =>
      tableNode(id).should("not.exist"),
    );

    cy.log(
      "Edges visible: users<->profiles (one-to-one) and categories self-ref. Cross-schema FK has no edge until expansion",
    );
    cy.get(".react-flow__edge").should("have.length", 2);

    cy.log(
      "Click the cross-schema FK on products.lookup_id — adds sv_extra.lookup to the canvas",
    );
    cy.get<TableId>("@productsId").then((id) =>
      tableNode(id).findByText("lookup_id").click({ force: true }),
    );
    cy.wait("@erd");
    cy.get<TableId>("@lookupId").then((id) => {
      tableNode(id).should("be.visible");
    });
    cy.log("Edge count grows by one (products → lookup edge added)");
    cy.get(".react-flow__edge").should("have.length", 3);

    cy.log(
      "Reload — the expanded lookup table persists via UKV (URL stays untouched, canvas keeps the table)",
    );
    cy.reload();
    cy.wait("@erd");
    cy.get<TableId>("@lookupId").then((id) => {
      tableNode(id).should("be.visible");
    });
    cy.get(".react-flow__edge").should("have.length", 3);
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
    cy.wait("@erd");

    cy.log(
      "Schema viewer renders for the analyst — Sample DB tables on canvas",
    );
    tableNode(ORDERS_ID).should("be.visible");
    tableNode(PRODUCTS_ID).should("be.visible");
    tableNode(PEOPLE_ID).should("be.visible");
    tableNode(REVIEWS_ID).should("be.visible");

    cy.log("Selection still works for the non-admin user");
    tableNode(ORDERS_ID).findByText("ORDERS").click();
    infoPanel().should("be.visible").and("contain", "ORDERS");
  });
});
