import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;
const { TablePicker } = H.DataModel;

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

interface PublishModelResponse {
  models: {
    id: number;
  }[];
}

describe("bulk table operations", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.intercept("POST", "/api/ee/data-studio/table/sync-schema").as(
      "syncSchema",
    );
    cy.intercept("POST", "/api/ee/data-studio/table/rescan-values").as(
      "rescanValues",
    );
    cy.intercept("POST", "/api/ee/data-studio/table/discard-values").as(
      "discardValues",
    );
    cy.intercept(
      "GET",
      `/api/database/${WRITABLE_DB_ID}/schema/public?include_hidden=true&include_editable_data_model=true`,
    ).as("getSchema");
    cy.intercept("POST", "/api/ee/data-studio/table/publish-model").as(
      "publishModel",
    );
  });

  it("syncing multiple tables", { tags: ["@external"] }, () => {
    H.restore("postgres-writable");
    H.activateToken("bleeding-edge");
    H.DataModel.visitDataStudio();
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

  it("allows publishing multiple tables", { tags: ["@external"] }, () => {
    H.restore("postgres-writable");
    H.activateToken("bleeding-edge");
    cy.signInAsAdmin();
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("Writable Postgres12").click();
    TablePicker.getTable("Accounts").find('input[type="checkbox"]').check();
    TablePicker.getTable("Feedback").find('input[type="checkbox"]').check();
    cy.findByRole("button", { name: /Publish/ }).click();
    cy.findByLabelText("Don’t show this to me again").check();
    cy.findByRole("button", { name: /Got it/ }).click();

    H.pickEntity({
      tab: "Collections",
      path: ["Our analytics"],
    });
    cy.findByRole("button", { name: /Publish here/ }).click();

    cy.wait<PublishModelResponse>("@publishModel").then(({ response }) => {
      expect(response?.body.created_count).to.eq(2);
    });

    H.undoToast().within(() => {
      cy.findByText("Published").should("be.visible");
      cy.findByRole("button", { name: /See it/ }).click();
    });

    cy.findByTestId("collection-caption").within(() => {
      cy.findByText("Our analytics").should("be.visible");
    });
  });

  it("allows to edit attributes for tables", { tags: ["@external"] }, () => {
    H.restore("postgres-writable");
    H.activateToken("bleeding-edge");
    cy.signInAsAdmin();
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("Writable Postgres12").click();
    TablePicker.getTable("Accounts").find('input[type="checkbox"]').check();
    TablePicker.getTable("Feedback").find('input[type="checkbox"]').check();

    H.selectHasValue("Owner", "").click();
    H.selectDropdown().contains("Bobby Tables").click();

    H.selectHasValue("Visibility type", "").click();
    H.selectDropdown().contains("Gold").click();

    H.selectHasValue("Entity type", "").click();
    H.selectDropdown().contains("Person").click();

    H.selectHasValue("Source", "").click();
    H.selectDropdown().contains("Ingested").click();
    H.undoToastList().should("have.length", 4);
    TablePicker.getTable("Accounts")
      .findByTestId("table-owner")
      .should("have.text", "Bobby Tables");
    TablePicker.getTable("Feedback")
      .findByTestId("table-owner")
      .should("have.text", "Bobby Tables");
  });

  it("allows to edit attributes for db", { tags: ["@external"] }, () => {
    H.restore("postgres-writable");
    H.activateToken("bleeding-edge");
    cy.signInAsAdmin();
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("Writable Postgres12")
      .find('input[type="checkbox"]')
      .check();

    H.selectHasValue("Owner", "").click();
    H.selectDropdown().contains("Bobby Tables").click();

    H.selectHasValue("Visibility type", "").click();
    H.selectDropdown().contains("Gold").click();

    H.selectHasValue("Entity type", "").click();
    H.selectDropdown().contains("Person").click();

    H.selectHasValue("Source", "").click();
    H.selectDropdown().contains("Ingested").click();

    cy.findByRole("button", { name: /Publish/ }).click();
    cy.findByRole("button", { name: /Got it/ }).click();
    H.pickEntity({
      tab: "Collections",
      path: ["Our analytics"],
    });
    cy.findByRole("button", { name: /Publish here/ }).click();

    TablePicker.getDatabase("Writable Postgres12").click();

    cy.findAllByTestId("tree-item")
      .filter('[data-type="table"]')
      .each((table) => {
        cy.wrap(table)
          .findByTestId("table-owner")
          .should("have.text", "Bobby Tables");
        cy.wrap(table)
          .findByTestId("table-published")
          .findByLabelText("Published")
          .should("be.visible");
      });
  });

  it("allows to edit attributes for schema", { tags: ["@external"] }, () => {
    H.restore("postgres-writable");
    H.activateToken("bleeding-edge");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "Animals" });
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("Writable Postgres12").click();
    TablePicker.getSchema("Schema A").find('input[type="checkbox"]').check();
    TablePicker.getSchema("Schema B").find('input[type="checkbox"]').check();

    cy.findByRole("heading", { name: /Multiple tables selected/ }).click();

    H.selectHasValue("Owner", "").click();
    H.selectDropdown().contains("Bobby Tables").click();

    H.selectHasValue("Visibility type", "").click();
    H.selectDropdown().contains("Gold").click();

    H.selectHasValue("Entity type", "").click();
    H.selectDropdown().contains("Person").click();

    H.selectHasValue("Source", "").click();
    H.selectDropdown().contains("Ingested").click();

    TablePicker.getSchema("Schema A").click();
    TablePicker.getSchema("Schema B").click();

    cy.findByTestId("loading-placeholder").should("not.exist");
    cy.findAllByTestId("tree-item")
      .filter('[data-type="table"]')
      .each((table) => {
        cy.wrap(table)
          .findByTestId("table-owner")
          .should("have.text", "Bobby Tables");
      });
  });
});

function getTableId(tables: Table[], tableName: string) {
  return tables.find((table: Table) => table.display_name === tableName)?.id;
}
