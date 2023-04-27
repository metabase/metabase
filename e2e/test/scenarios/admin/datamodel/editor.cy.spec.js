import {
  openOrdersTable,
  popover,
  restore,
  startNewQuestion,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;
const ORDERS_DESCRIPTION =
  "Confirmed Sample Company orders for a product, from a user.";
describe("scenarios > admin > datamodel > editor", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database/*/schema/*").as("fetchTables");
    cy.intercept("GET", "/api/table/*/query_metadata*").as("fetchMetadata");
    cy.intercept("PUT", "/api/table").as("updateTables");
    cy.intercept("PUT", "/api/table/*").as("updateTable");
    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("PUT", "/api/table/*/fields/order").as("updateFieldOrder");
  });

  it("should allow changing the table name", () => {
    visitOrdersTableEditor();
    setInputValue("Orders", "New orders");
    cy.wait("@updateTable");
    cy.findByText("Updated table display_name");

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("People").should("be.visible");
      cy.findByText("New orders").should("be.visible");
    });
  });

  it("should allow changing the table description", () => {
    visitOrdersTableEditor();
    setInputValue(ORDERS_DESCRIPTION, "New description");
    cy.wait("@updateTable");
    cy.findByText("Updated table description");

    cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
    cy.findByText("Orders").should("be.visible");
    cy.findByText("New description").should("be.visible");
  });

  it("should allow clearing the table description", () => {
    visitOrdersTableEditor();
    clearInputValue(ORDERS_DESCRIPTION);
    cy.wait("@updateTable");
    cy.findByText("Updated table description");

    cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
    cy.findByText("Orders").should("be.visible");
    cy.findByText("No description yet").should("be.visible");
  });

  it("should allow changing the table visibility", () => {
    visitOrdersTableEditor();
    cy.findByText("Hidden").click();
    cy.wait("@updateTable");
    cy.findByText("Updated table visibility_type");
    cy.findByText("5 Hidden Tables").should("be.visible");

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("People").should("be.visible");
      cy.findByText("Orders").should("not.exist");
    });

    visitOrdersTableEditor();
    cy.findByText("Queryable").click();
    cy.wait("@updateTable");
    cy.findByText("4 Hidden Tables").should("be.visible");

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("People").should("be.visible");
      cy.findByText("Orders").should("be.visible");
    });
  });

  it("should allow changing the field name", () => {
    visitOrdersTableEditor();
    getFieldSection("TAX").within(() => setInputValue("Tax", "New tax"));
    cy.findByText("Updated New tax").should("be.visible");
    cy.wait("@updateField");

    openOrdersTable();
    cy.findByText("New tax").should("be.visible");
    cy.findByText("Tax").should("not.exist");
  });

  it("should allow changing the field description", () => {
    visitOrdersTableEditor();
    getFieldSection("TOTAL").within(() =>
      setInputValue("The total billed amount.", "New description"),
    );
    cy.findByText("Updated Total").should("be.visible");
    cy.wait("@updateField");

    cy.visit(
      `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
    );
    cy.findByText("Total").should("be.visible");
    cy.findByText("New description").should("be.visible");
  });

  it("should allow clearing the field description", () => {
    visitOrdersTableEditor();
    getFieldSection("TOTAL").within(() =>
      clearInputValue("The total billed amount."),
    );
    cy.findByText("Updated Total").should("be.visible");
    cy.wait("@updateField");

    cy.visit(
      `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
    );
    cy.findByText("Total").should("be.visible");
    cy.findByText("No description yet").should("be.visible");
  });

  it("should allow changing the field visibility", () => {
    visitOrdersTableEditor();
    getFieldSection("TAX").findByText("Everywhere").click();
    setSelectValue("Do not include");
    cy.findByText("Updated Tax").should("be.visible");
    cy.wait("@updateField");

    openOrdersTable();
    cy.findByText("Total").should("be.visible");
    cy.findByText("Tax").should("not.exist");
  });

  it("should allow changing the field semantic type and currency", () => {
    visitOrdersTableEditor();
    getFieldSection("TAX").findByText("No semantic type").click();
    searchAndSelectValue("Currency");
    cy.findByText("Updated Tax").should("be.visible");
    cy.wait("@updateField");

    getFieldSection("TAX").findByText("US Dollar").click();
    searchAndSelectValue("Canadian Dollar");
    cy.wait("@updateField");

    openOrdersTable();
    cy.findByText("Tax (CA$)").should("be.visible");
  });

  it("should allow changing the field foreign key target", () => {
    visitOrdersTableEditor();
    getFieldSection("USER_ID").findByText("People → ID").click();
    setSelectValue("Products → ID");
    cy.findByText("Updated User ID").should("be.visible");
    cy.wait("@updateField");

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    cy.icon("join_left_outer").click();
    popover().within(() => {
      cy.findByText("Products").click();
    });
    cy.findByText("User ID").should("be.visible");
  });

  it("should allow sorting fields", () => {
    visitOrdersTableEditor();

    cy.findByLabelText("Sort").click();
    popover().findByText("Alphabetical").click();
    cy.wait("@updateTable");

    moveField(3);
    cy.wait("@updateFieldOrder");

    openOrdersTable();
    cy.findAllByTestId("header-cell").first().should("have.text", "Product ID");
  });

  it("should allow hiding and restoring all tables in a schema", () => {
    visitOrdersTableEditor();
    cy.findByText("4 Queryable Tables").should("be.visible");
    cy.findByLabelText("Hide all").click();
    cy.wait("@updateTables");

    visitOrdersTableEditor();
    cy.findByText("8 Hidden Tables").should("be.visible");
    cy.findByLabelText("Unhide all").click();
    cy.wait("@updateTables");
    cy.findByText("8 Queryable Tables").should("be.visible");
  });
});

describe(
  "scenarios > admin > datamodel > editor",
  { tags: ["@external"] },
  () => {
    beforeEach(() => {
      restore("mysql-8");
      cy.signInAsAdmin();
      cy.intercept("GET", "/api/database").as("fetchDatabases");
      cy.intercept("GET", "/api/database/*/schema/*").as("fetchTables");
      cy.intercept("GET", "/api/table/*/query_metadata*").as("fetchMetadata");
      cy.intercept("PUT", "/api/table/*").as("updateTable");
      cy.intercept("PUT", "/api/field/*").as("updateField");
    });

    it("should be able to select and update a table in a database without schemas", () => {
      visitOrdersTableEditor("QA MySQL8");
      setInputValue("Orders", "New orders");
      cy.wait("@updateTable");
    });

    it("should be able to select and update a field in a database without schemas", () => {
      visitOrdersTableEditor("QA MySQL8");
      getFieldSection("TAX").findByText("Everywhere").click();
      setSelectValue("Do not include");
      cy.wait("@updateField");
    });
  },
);

const visitOrdersTableEditor = (database = "Sample Database") => {
  cy.visit("/admin/datamodel");
  cy.wait("@fetchTables");
  cy.findByText(database).should("be.visible");

  cy.findByText("Orders").click();
  cy.wait("@fetchMetadata");
};

const setInputValue = (oldValue, newValue) => {
  cy.findByDisplayValue(oldValue).clear().type(newValue).blur();
};

const clearInputValue = oldValue => {
  cy.findByDisplayValue(oldValue).clear().blur();
};

const setSelectValue = newValue => {
  popover().within(() => {
    cy.findByText(newValue).click();
  });
};

const searchAndSelectValue = (newValue, searchText = newValue) => {
  popover().within(() => {
    cy.findByRole("grid").scrollTo("top", { ensureScrollable: false });
    cy.findByPlaceholderText("Find...").type(searchText);
    cy.findByText(newValue).click();
  });
};

const getFieldSection = fieldName => {
  return cy.findByLabelText(fieldName);
};

const moveField = fieldIndex => {
  cy.get(".Grabber").eq(fieldIndex).trigger("mousedown", 0, 0);
  cy.get("#ColumnsList")
    .trigger("mousemove", 10, 10)
    .trigger("mouseup", 10, 10);
};
