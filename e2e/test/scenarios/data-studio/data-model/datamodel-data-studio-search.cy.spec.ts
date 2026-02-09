import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;
const { TablePicker } = H.DataModel;

describe("Search", () => {
  beforeEach(() => {
    cy.signInAsAdmin();
    H.restore("postgres-writable", { reindex: true });
    H.resetSnowplow();
    H.activateToken("bleeding-edge");
    H.resetTestTable({ type: "postgres", table: "multi_schema" });
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
    cy.intercept("GET", "/api/table?*").as("listTables");
  });

  it("should support prefix-based search", () => {
    H.DataModel.visitDataStudio();

    TablePicker.getSearchInput().type("an");
    TablePicker.getTables().should("have.length", 3);
    TablePicker.getTable("Analytic Events").should("be.visible");
    TablePicker.getTable("Animals").should("be.visible");
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_table_picker_search_performed",
    });
  });

  it("should support wildcard search with *", () => {
    H.DataModel.visitDataStudio();

    TablePicker.getSearchInput().type("irds");
    TablePicker.get().findByText("No tables found").should("be.visible");
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_table_picker_search_performed",
    });

    TablePicker.getSearchInput().clear().type("*irds");
    TablePicker.getTables().should("have.length", 1);
    TablePicker.getTable("Birds").should("be.visible");
    H.expectUnstructuredSnowplowEvent(
      {
        event: "data_studio_table_picker_search_performed",
      },
      2,
    );
  });

  it("should allow using shift key to select multiple tables", () => {
    H.DataModel.visitDataStudio();
    TablePicker.getSearchInput().type("a");

    TablePicker.getTables().should("have.length", 4);
    TablePicker.getTable("Accounts").find('input[type="checkbox"]').click();
    TablePicker.getTable("Animals")
      .eq(0)
      .find('input[type="checkbox"]')
      .click({ shiftKey: true });

    cy.findByRole("heading", { name: /3 tables selected/i }).should(
      "be.visible",
    );
  });

  it("should remove the active highlight once tables are selected", () => {
    H.DataModel.visitDataStudio();

    TablePicker.getSearchInput().type("an");
    TablePicker.getTable("Animals").eq(0).should("be.visible").click();
    TablePicker.getTable("Animals")
      .eq(0)
      .should("have.attr", "aria-selected", "true");

    TablePicker.getTable("Animals")
      .eq(0)
      .find('input[type="checkbox"]')
      .check();
    TablePicker.getTable("Animals").eq(1).should("be.visible").click();

    TablePicker.getTable("Animals")
      .eq(0)
      .should("not.have.attr", "aria-selected", "true");
    TablePicker.getTable("Animals")
      .eq(1)
      .should("not.have.attr", "aria-selected", "true");
  });

  it("should select/deselect tables with clicking checkboxes", () => {
    H.DataModel.visitDataStudio();
    TablePicker.getSearchInput().type("a");
    TablePicker.getTables().should("have.length", 4);
    TablePicker.getTable("Accounts")
      .find('input[type="checkbox"]')
      .as("accountsCheckbox");
    TablePicker.getTable("Analytic Events")
      .find('input[type="checkbox"]')
      .as("analyticEventsCheckbox");
    cy.get("@accountsCheckbox").check();
    cy.get("@analyticEventsCheckbox").check();
    cy.findByRole("heading", { name: /2 tables selected/i }).should(
      "be.visible",
    );
    cy.get("@accountsCheckbox").uncheck();
    cy.findByRole("heading", { name: /2 tables selected/i }).should(
      "not.exist",
    );

    // clear selection when changing search query
    cy.get("@accountsCheckbox").check();
    cy.findByRole("heading", { name: /2 tables selected/i }).should(
      "be.visible",
    );
    TablePicker.getSearchInput().type("c");
    cy.findByRole("heading", { name: /2 tables selected/i }).should(
      "not.exist",
    );
  });

  it("should select/deselect databases and schemas", () => {
    H.DataModel.visitDataStudio();
    TablePicker.getSearchInput().type("a");
    // wait for the tables to be loaded
    TablePicker.getTables().should("have.length", 4);
    const postgres = "Writable Postgres12";
    const sampleDatabaseName = "Sample Database";
    const domesticSchema = "Domestic";

    TablePicker.getDatabaseCheckbox(sampleDatabaseName).click();
    cy.findByRole("heading", { name: /2 tables selected/i }).should(
      "be.visible",
    );
    TablePicker.getDatabaseCheckbox(postgres).click();
    cy.findByRole("heading", { name: /4 tables selected/i }).should(
      "be.visible",
    );
    TablePicker.getSchemaCheckbox(domesticSchema).click();
    cy.findByRole("heading", { name: /3 tables selected/i }).should(
      "be.visible",
    );
    TablePicker.getDatabaseCheckbox(postgres).click();
    cy.findByRole("heading", { name: /4 tables selected/i }).should(
      "be.visible",
    );
  });

  it("should allow to hide/show table and schemas", () => {
    H.DataModel.visitDataStudio();
    TablePicker.getSearchInput().type("a");
    const postgres = "Writable Postgres12";
    const sampleDatabaseName = "Sample Database";
    const domesticSchema = "Domestic";
    const sampleDbTables = ["Accounts", "Analytic Events"];

    sampleDbTables.forEach((table) => {
      TablePicker.getTable(table).should("be.visible");
    });

    TablePicker.getDatabaseToggle(sampleDatabaseName).click();
    sampleDbTables.forEach((table) => {
      TablePicker.getTable(table).should("not.exist");
    });

    TablePicker.getTable("Animals").should("have.length", 2);
    TablePicker.getSchemaToggle(domesticSchema).click();
    TablePicker.getTable("Animals").should("have.length", 1);

    TablePicker.getDatabaseToggle(postgres).click();
    TablePicker.getTables().should("have.length", 0);
    TablePicker.getDatabases().should("have.length", 2);
  });

  it("should deselect and hide tables that are not in the search results", () => {
    H.DataModel.visitDataStudio();

    TablePicker.getTables().should("have.length", 0);
    TablePicker.getSearchInput().type("a");
    TablePicker.getTables().should("have.length", 4);

    ["Writable Postgres12", "Sample Database"].forEach((database) => {
      TablePicker.getDatabaseCheckbox(database).click();
    });
    cy.findByRole("heading", { name: /4 tables selected/i }).should(
      "be.visible",
    );
    TablePicker.getTables()
      .find('input[type="checkbox"]:checked')
      .should("have.length", 4);

    TablePicker.openFilterPopover();
    cy.findByTestId("table-picker-filter").within(() => {
      TablePicker.selectFilterOption("Visibility layer", "Internal");
      TablePicker.applyFilters();
    });

    TablePicker.getTables()
      .find('input[type="checkbox"]:checked')
      .should("have.length", 0);

    TablePicker.getDatabaseCheckbox("Writable Postgres12").click();

    cy.findByRole("heading", { name: /2 tables selected/i }).should(
      "be.visible",
    );

    TablePicker.selectFilterOption("Visibility layer", "Final");
    TablePicker.get().findByText("No tables found").should("be.visible");
    cy.findByRole("heading", { name: /2 tables selected/i }).should(
      "not.exist",
    );
  });
});
