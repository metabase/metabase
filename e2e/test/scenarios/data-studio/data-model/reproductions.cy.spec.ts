const { H } = cy;
import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE_ID, PEOPLE, REVIEWS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 18384", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // Hide Reviews table
    cy.request("PUT", "/api/table", {
      ids: [REVIEWS_ID],
      visibility_type: "hidden",
    });
  });

  it("should be able to open field properties even when one of the tables is hidden (metabase#18384)", () => {
    H.DataModel.visitDataStudio({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: PEOPLE_ID,
    });

    H.DataModel.TableSection.clickField("Address");

    cy.location("pathname").should(
      "eq",
      `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PEOPLE_ID}/field/${PEOPLE.ADDRESS}`,
    );

    H.DataModel.FieldSection.getNameInput()
      .should("be.visible")
      .and("have.value", "Address");
  });
});

describe("issue 21984", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata?**").as("tableMetadata");

    H.restore();
    cy.signInAsAdmin();

    H.DataModel.visitDataStudio({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: REVIEWS_ID,
    });
    cy.wait("@tableMetadata");

    cy.findByDisplayValue("ID");
  });

  it('should not show data model visited tables in search or in "Pick up where you left off" items on homepage (metabase#21984)', () => {
    cy.visit("/");

    cy.findByTestId("home-page").within(() => {
      // the table should not be in the recents results
      cy.findByText("Reviews").should("not.exist");
    });

    H.commandPaletteButton().click();
    H.commandPalette().within(() => {
      cy.findByText("Recents").should("not.exist");
    });
  });
});

describe("issue 15542", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/field/*/dimension").as("fieldDimensionUpdate");
  });

  function openOrdersTable() {
    // Navigate without reloading the page
    H.navigationSidebar().findByText("Databases").click({
      // force the click because the sidebar might be closed but
      // that is not what we are testing here.
      force: true,
    });

    cy.findByText("Sample Database").click();
    cy.findByText("Orders").click();
  }

  function openOrdersProductIdSettings() {
    // Navigate without reloading the page
    H.navigationSidebar().findByText("Data Studio").click();
    cy.findByText("Data").click();
    H.DataModel.TablePicker.getTable("Orders").click();
    H.DataModel.TableSection.clickField("Product ID");
  }

  it("should be possible to use the foreign key field display values immediately when changing the setting", () => {
    // This test does manual naviation instead of using openOrdersTable and similar
    // helpers because they use cy.visit under the hood and that reloads the page,
    // clearing the in-browser cache, which is what we are testing here.
    H.DataModel.visitDataStudio({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });

    H.DataModel.FieldSection.getFilteringInput().click();
    H.popover().findByText("A list of all values").click();

    H.DataModel.FieldSection.getDisplayValuesInput().click();
    H.popover().findByText("Use foreign key").click();
    H.popover().findByText("Title").click();

    cy.wait("@fieldDimensionUpdate");

    H.goToMainApp();
    openOrdersTable();

    H.tableHeaderClick("Product ID");
    H.popover().findByText("Filter by this column").click();

    H.popover().within(() => {
      cy.findByText("1").should("not.exist");
      cy.findByText("Rustic Paper Wallet").should("be.visible");
    });

    openOrdersProductIdSettings();

    H.DataModel.FieldSection.getDisplayValuesInput().click();
    H.popover().findByText("Use original value").click();

    H.goToMainApp();
    openOrdersTable();

    H.tableHeaderClick("Product ID");
    H.popover().findByText("Filter by this column").click();

    H.popover().within(() => {
      cy.findByText("1").should("be.visible");
      cy.findByText("Rustic Paper Wallet").should("not.exist");
    });
  });
});

describe("issue 52411", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "multi_schema" });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
  });

  it("should redirect /admin/datamodel/segments to /data-studio/data (metabase#52411)", () => {
    cy.visit("/admin/datamodel/segments");
    cy.location("pathname").should("eq", "/data-studio/data");
  });
});

describe("issue 53595", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database/*/schema/*").as("getSchema");
  });

  it("all options are visibile while filtering the list of entity types (metabase#53595)", () => {
    H.DataModel.visitDataStudio({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: PEOPLE_ID,
      fieldId: PEOPLE.ID,
    });

    H.DataModel.FieldSection.getSemanticTypeInput().focus().clear().type("cu");

    H.popover().findByText("Currency").should("be.visible");
    H.popover().then(($popover) => {
      expect(H.isScrollableVertically($popover[0])).to.be.false;
    });
  });
});
