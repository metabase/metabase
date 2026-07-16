const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const DB_NAME = "Writable Postgres12";
const SLASH_SCHEMA = "public/transactions";
const TABLE_NAME = "slash_schema_orders";
const TABLE_DISPLAY_NAME = "Slash Schema Orders";
const ANCHOR_TABLE_NAME = "plain_schema_anchor";

const SCHEMA_URL = `/browse/databases/${WRITABLE_DB_ID}/schema/${encodeURIComponent(SLASH_SCHEMA)}`;

const CLEANUP_SQL = `
  DROP SCHEMA IF EXISTS "${SLASH_SCHEMA}" CASCADE;
  DROP TABLE IF EXISTS public.${ANCHOR_TABLE_NAME};
`;

const SETUP_SQL = `
  ${CLEANUP_SQL}
  CREATE SCHEMA "${SLASH_SCHEMA}";
  CREATE TABLE "${SLASH_SCHEMA}".${TABLE_NAME} (
    id SERIAL PRIMARY KEY,
    total INTEGER
  );
  INSERT INTO "${SLASH_SCHEMA}".${TABLE_NAME} (total) VALUES (10), (20);
  CREATE TABLE public.${ANCHOR_TABLE_NAME} (id SERIAL PRIMARY KEY);
`;

const assertTableVisible = () =>
  cy.findByRole("heading", { name: TABLE_DISPLAY_NAME }).should("be.visible");

describe(
  "issue 77353 (schema names containing a slash)",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.queryWritableDB(SETUP_SQL, "postgres");
      H.resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tables: [TABLE_NAME, ANCHOR_TABLE_NAME],
      });
    });

    after(() => {
      H.queryWritableDB(CLEANUP_SQL, "postgres");
    });

    it("should browse and query tables in a schema whose name contains a slash (metabase#77353)", () => {
      cy.log("browse to the schema from the database page");
      cy.visit(`/browse/databases/${WRITABLE_DB_ID}`);
      cy.findByRole("heading", { name: SLASH_SCHEMA }).click();
      cy.location("pathname").should("eq", SCHEMA_URL);
      assertTableVisible();

      cy.log("pick a table from the slashed schema in the data picker");
      H.newButton("Question").click();
      H.miniPicker().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(SLASH_SCHEMA).click();
        cy.findByText(TABLE_DISPLAY_NAME).click();
      });
      H.visualize();
      H.assertQueryBuilderRowCount(2);
    });
  },
);
