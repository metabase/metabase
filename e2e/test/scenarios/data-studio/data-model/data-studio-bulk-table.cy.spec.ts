const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
const DATA_STUDIO_BASE_PATH = "/data-studio/data";
const visitAdminDataModel = H.DataModel.visit;
const { TablePicker } = H.DataModel;

H.DataModel.visit = (options = {}) =>
  visitAdminDataModel({ ...options, basePath: DATA_STUDIO_BASE_PATH });

interface TablesActionRequest {
  database_ids: number[];
  schema_ids: number[];
  table_ids: number[];
}

interface TablesActionsResponse {
  status: string;
  message: string;
}

interface Table {
  display_name: string;
  id: number;
}

describe("syncing multiple tables", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/table/sync-schema").as("syncSchema");
    cy.intercept("POST", "/api/table/rescan-values").as("rescanValues");
    cy.intercept("POST", "/api/table/discard-values").as("discardValues");
    cy.intercept(
      "GET",
      `/api/database/${WRITABLE_DB_ID}/schema/public?include_hidden=true&include_editable_data_model=true`,
    ).as("getSchema");
  });

  it("syncing multiple tables", () => {
    H.DataModel.visit();
    TablePicker.getDatabase("Writable Postgres12").click();
    cy.wait("@getSchema").then(({ response }) => {
      const tables = response?.body ?? [];
      const accountTableId = getTableId(tables, "Accounts");
      const feedbackTableId = getTableId(tables, "Feedback");

      cy.wrap([accountTableId, feedbackTableId]).as("tableIds");
    });

    TablePicker.getTable("Accounts").find('input[type="checkbox"]').check();
    TablePicker.getTable("Feedback").find('input[type="checkbox"]').check();
    cy.findByRole("heading", { name: /2 tables selected/ });

    cy.findByRole("button", { name: /Sync settings/ }).click();
    cy.findByRole("button", { name: /Sync table schemas/ }).click();
    cy.findByRole("button", { name: /Sync triggered!/ }).should("be.visible");
    cy.get<number[]>("@tableIds").then((tableIds) => {
      cy.wait<TablesActionRequest, TablesActionsResponse>("@syncSchema").then(
        ({ request, response }) => {
          expect(request.body.table_ids).to.deep.eq(tableIds);
          expect(response?.body.status).to.eq("ok");
        },
      );
    });

    cy.findByRole("button", { name: /Re-scan tables/ }).click();
    cy.findByRole("button", { name: /Scan triggered!/ }).should("be.visible");

    cy.get<number[]>("@tableIds").then((tableIds) => {
      cy.wait<TablesActionRequest, TablesActionsResponse>("@rescanValues").then(
        ({ request, response }) => {
          expect(request.body.table_ids).to.deep.eq(tableIds);
          expect(response?.body.status).to.eq("ok");
        },
      );
    });

    cy.findByRole("button", { name: /Discard cached field values/ }).click();
    cy.findByRole("button", { name: /Discard triggered!/ }).should(
      "be.visible",
    );
    cy.get<number[]>("@tableIds").then((tableIds) => {
      cy.wait<TablesActionRequest, TablesActionsResponse>(
        "@discardValues",
      ).then(({ request, response }) => {
        expect(request.body.table_ids).to.deep.eq(tableIds);
        expect(response?.body.status).to.eq("ok");
      });
    });
  });
});

function getTableId(tables: Table[], tableName: string) {
  return tables.find((table: Table) => table.display_name === tableName)?.id;
}
