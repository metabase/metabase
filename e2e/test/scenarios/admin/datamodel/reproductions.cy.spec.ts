const { H } = cy;
import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE_ID, PEOPLE, REVIEWS, REVIEWS_ID, ORDERS, ORDERS_ID } =
  SAMPLE_DATABASE;

describe("issue 17768", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${REVIEWS.ID}`, {
      semantic_type: "type/Category",
      has_field_values: "list",
    });

    // Sync "Sample Database" schema
    cy.request("POST", `/api/database/${SAMPLE_DB_ID}/sync_schema`);

    waitForFieldSyncToFinish();

    cy.request("PUT", `/api/field/${REVIEWS.ID}`, {
      semantic_type: "type/PK",
      has_field_values: "none",
    });
  });

  it("should not show binning options for an entity key, regardless of its underlying type (metabase#17768)", () => {
    H.openReviewsTable({ mode: "notebook" });

    H.summarize({ mode: "notebook" });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();

    H.popover().within(() => {
      cy.findByText("ID")
        .closest("[data-element-id=list-section]")
        .realHover()
        .contains("Auto bin")
        .should("not.exist");
    });
  });
});

describe("issue 21984", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata?**").as("tableMetadata");

    H.restore();
    cy.signInAsAdmin();

    H.DataModel.visit({
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
    H.goToAdmin();

    H.appBar().findByText("Table Metadata").click();
    H.DataModel.TablePicker.getTable("Orders").click();
    H.DataModel.TableSection.clickField("Product ID");
  }

  it("should be possible to use the foreign key field display values immediately when changing the setting", () => {
    // This test does manual naviation instead of using openOrdersTable and similar
    // helpers because they use cy.visit under the hood and that reloads the page,
    // clearing the in-browser cache, which is what we are testing here.
    H.DataModel.visit({
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

describe("issue 53595", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database/*/schema/*").as("getSchema");
  });

  it("all options are visibile while filtering the list of entity types (metabase#53595)", () => {
    H.DataModel.visit({
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

describe("issue 55619", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow you to change the currency where you can set a semantic type (metabase#55619)", () => {
    cy.log("set a non-default value");
    cy.request("PUT", `/api/field/${ORDERS.DISCOUNT}`, {
      settings: { currency: "CAD" },
    });

    cy.log("data reference - field list");
    cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields`);
    H.main().within(() => {
      cy.button(/Edit/).click();
      cy.findByDisplayValue("Canadian Dollar").click();
    });
    H.popover().findByText("Euro").click();
    H.main().within(() => {
      cy.findByDisplayValue("Euro").should("be.visible");
      cy.button(/Save/).click();
      cy.button(/Edit/).should("be.visible");
    });

    cy.log("data reference - field details");
    H.main().within(() => {
      cy.findByRole("link", { name: /Discount/ }).click();
      cy.button(/Edit/).click();
      cy.findByDisplayValue("Euro").click();
    });
    H.popover().findByText("Australian Dollar").click();
    H.main().within(() => {
      cy.findByDisplayValue("Australian Dollar").should("be.visible");
      cy.button(/Save/).click();
      cy.button(/Edit/).should("be.visible");
    });

    cy.log("model metadata");
    H.navigationSidebar().findByText("Models").click();
    H.main().within(() => {
      cy.findByLabelText("Create a new model").click();
      cy.findByText("Use the notebook editor").click();
    });
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    H.runButtonOverlay().click();
    H.tableInteractive().should("contain", "37.65");
    cy.findByTestId("editor-tabs-columns-name").click();
    H.openColumnOptions("Discount");
    cy.findByTestId("sidebar-content")
      .findByDisplayValue("Australian Dollar")
      .click();
    H.popover().findByText("Euro").click();
    cy.findByTestId("sidebar-content")
      .findByDisplayValue("Euro")
      .should("be.visible");
    H.datasetEditBar().button("Save").click();
    H.modal().button("Save").click();
    H.modal().should("not.exist"); // wait for modal to disappear
    H.queryBuilderHeader().findByText("Orders").should("be.visible"); // wait for qb to turn into view-mode
    cy.findByTestId("loading-indicator").should("not.exist"); // wait for query to complete
    H.tableHeaderColumn("Discount (€)").should("be.visible");
  });
});

function waitForFieldSyncToFinish(iteration = 0) {
  // 100 x 100ms should be plenty of time for the sync to finish.
  // If it doesn't, we have a much bigger problem than this issue.
  if (iteration === 100) {
    return;
  }

  cy.request("GET", `/api/field/${REVIEWS.ID}`).then(
    ({ body: { fingerprint } }) => {
      if (fingerprint === null) {
        cy.wait(100);

        waitForFieldSyncToFinish(++iteration);
      }

      return;
    },
  );
}
