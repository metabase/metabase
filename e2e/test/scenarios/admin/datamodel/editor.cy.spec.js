import { restore, popover } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;
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

  it("should allow editing of the name and description", () => {
    visitOrdersTable();

    cy.findByDisplayValue("Orders").clear().type("New name").blur();
    cy.wait("@updateTable");

    cy.findByDisplayValue(ORDERS_DESCRIPTION)
      .clear()
      .type("New description")
      .blur();
    cy.wait("@updateTable");

    cy.findByDisplayValue("New name").should("be.visible");
    cy.findByDisplayValue("New description").should("be.visible");
  });

  it("should allow changing the visibility and reason", () => {
    visitOrdersTable();

    cy.findByText("Hidden").click();
    cy.wait("@updateTable");
    cy.findByText("5 Hidden Tables").should("be.visible");

    cy.contains("Technical Data").click();
    cy.wait("@updateTable");
    cy.findByText("5 Hidden Tables").should("be.visible");
  });

  it("should allow hiding of columns outside of detail views", () => {
    visitOrdersTable();

    selectValue({
      field: "CREATED_AT",
      oldValue: "Everywhere",
      newValue: "Only in detail views",
    });
    cy.wait("@updateField");
  });

  it("should allow hiding of columns entirely", () => {
    visitOrdersTable();

    selectValue({
      field: "CREATED_AT",
      oldValue: "Everywhere",
      newValue: "Do not include",
    });
    cy.wait("@updateField");
  });

  it("should allow changing of semantic type and currency", () => {
    visitOrdersTable();

    searchAndSelectValue({
      field: "TAX",
      oldValue: "No semantic type",
      newValue: "Currency",
    });
    cy.wait("@updateField");

    searchAndSelectValue({
      field: "TAX",
      oldValue: "US Dollar",
      newValue: "Canadian Dollar",
    });
    cy.wait("@updateField");
  });

  it("should allow changing of foreign key target", () => {
    visitOrdersTable();

    searchAndSelectValue({
      field: "USER_ID",
      oldValue: "People → ID",
      newValue: "Products → ID",
      newValueSearchText: "Products",
    });
    cy.wait("@updateField");
  });

  it("should allow sorting columns", () => {
    visitOrdersTable();

    cy.findByLabelText("Sort").click();
    popover().findByText("Alphabetical").click();
    cy.wait("@updateTable");

    cy.get(".Grabber").eq(3).trigger("mousedown", 0, 0);
    cy.get("#ColumnsList")
      .trigger("mousemove", 10, 10)
      .trigger("mouseup", 10, 10);
    cy.wait("@updateFieldOrder");

    // check that new order is obeyed in queries
    cy.request("POST", "/api/dataset", {
      database: SAMPLE_DB_ID,
      query: { "source-table": ORDERS_ID },
      type: "query",
    }).then(resp => {
      expect(resp.body.data.cols[0].name).to.eq("PRODUCT_ID");
    });
  });

  it("should allow bulk hiding tables", () => {
    visitOrdersTable();
    cy.findByText("4 Queryable Tables").should("be.visible");

    cy.findByLabelText("Hide all").click();
    cy.wait("@updateTables");
    cy.findByText("8 Hidden Tables").should("be.visible");

    cy.findByLabelText("Unhide all").click();
    cy.wait("@updateTables");
    cy.findByText("8 Queryable Tables").should("be.visible");
  });
});

const visitOrdersTable = () => {
  cy.visit("/admin/datamodel");
  cy.wait("@fetchTables");

  cy.findByText("Orders").click();
  cy.wait("@fetchMetadata");
};

const selectValue = ({ field, oldValue, newValue }) => {
  cy.findByLabelText(field).within(() => {
    cy.findByText(oldValue).click();
  });

  popover().within(() => {
    cy.findByText(newValue).click();
  });
};

const searchAndSelectValue = ({
  field,
  oldValue,
  newValue,
  newValueSearchText = newValue,
}) => {
  cy.findByLabelText(field).within(() => {
    cy.findByText(oldValue).click();
  });

  popover().within(() => {
    cy.findByRole("grid").scrollTo("top", { ensureScrollable: false });
    cy.findByPlaceholderText("Find...").type(newValueSearchText);
    cy.findByText(newValue).click();
  });
};
