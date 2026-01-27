const { H } = cy;
import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
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
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: PEOPLE_ID,
    });

    H.DataModel.TableSection.clickField("Address");

    cy.location("pathname").should(
      "eq",
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PEOPLE_ID}/field/${PEOPLE.ADDRESS}`,
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
    H.appBar().icon("gear").click();
    H.popover().findByText("Admin settings").click();

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

    cy.findByRole("link", { name: "Exit admin" }).click();
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

    cy.findByRole("link", { name: "Exit admin" }).click();
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

  it("should be able to select a table in a database with multiple schemas on segments list page when there are multiple databases and there is a saved question (metabase#52411)", () => {
    cy.visit("/admin/datamodel/segments");
    cy.findByTestId("segment-list-table").findByText("Filter by table").click();
    H.popover().within(() => {
      cy.findByText("Writable Postgres12").click();
      cy.findByText("Wild").click();
      cy.findByText("Birds").click();
    });
    cy.findByTestId("segment-list-table")
      .findByText("Birds")
      .should("be.visible");
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

describe("issues 55617, 55618", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database").as("getDatabases");
    cy.intercept("GET", "/api/segment").as("getSegments");
    H.createSegment({
      name: "My segment",
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        filter: ["<", ["field", ORDERS.TOTAL, null], 100],
      },
    }).then(({ body: segment }) => {
      cy.wrap(segment.id).as("segmentId");
    });
  });

  it("should allow changing field's FK target mapping in table fields list view and table field detail view (metabase#55617, metabase#55618)", () => {
    cy.visit("/reference/databases");
    cy.wait("@getDatabases");
    cy.findByRole("link", { name: /Sample Database/ }).click();
    cy.findByRole("link", { name: /Tables in Sample Database/ }).click();
    cy.findByRole("link", { name: /Orders/ }).click();
    cy.findByRole("link", { name: /Fields in this table/ }).click();

    cy.log("field list view");
    cy.button(/Edit/).should("be.visible").realClick();

    cy.log("field list view - metabase#55618");
    cy.findAllByPlaceholderText("Select a target")
      .should("have.length", 2)
      .eq(0)
      .should("have.value", "People → ID");
    cy.findAllByPlaceholderText("Select a target")
      .eq(1)
      .should("have.value", "Products → ID");
    cy.findAllByPlaceholderText("Select a target").eq(0).click();
    H.popover().within(() => {
      cy.findByText("Orders → ID").should("be.visible");
      cy.findByText("People → ID").should("be.visible");
      cy.findByText("Products → ID").should("be.visible");
      cy.findByText("Reviews → ID").should("be.visible").click();
    });
    cy.findAllByPlaceholderText("Select a target")
      .eq(0)
      .should("have.value", "Reviews → ID");

    cy.log("field list view - metabase#55617");
    cy.findAllByPlaceholderText("Select a semantic type")
      .eq(6)
      .should("have.value", "Discount")
      .click();
    H.popover().findByText("No semantic type").click();
    cy.findAllByPlaceholderText("Select a semantic type")
      .eq(6)
      .should("have.value", "No semantic type");

    cy.log("field detail view");
    cy.button("Cancel").click();
    cy.findByRole("link", { name: /User ID/ }).click();

    cy.log("field detail view - metabase#55618");
    cy.button(/Edit/).should("be.visible").realClick();
    cy.findByPlaceholderText("Select a target")
      .should("have.value", "People → ID")
      .click();
    H.popover().within(() => {
      cy.findByText("Orders → ID").should("be.visible");
      cy.findByText("People → ID").should("be.visible");
      cy.findByText("Products → ID").should("be.visible");
      cy.findByText("Reviews → ID").should("be.visible").click();
    });
    cy.findByPlaceholderText("Select a target").should(
      "have.value",
      "Reviews → ID",
    );

    cy.log("field detail view - metabase#55617");
    cy.findByPlaceholderText("Select a semantic type")
      .should("have.value", "Foreign Key")
      .click();
    H.popover().findByText("No semantic type").click();
    cy.findByPlaceholderText("Select a semantic type").should(
      "have.value",
      "No semantic type",
    );
  });

  it("should allow changing field's FK target mapping in segments field list view and segment field detail view (metabase#55617, metabase#55618)", () => {
    cy.visit("/reference/segments");
    cy.wait("@getSegments");
    cy.findByRole("link", { name: /My segment/ }).click();
    cy.findByRole("link", { name: /Fields in this segment/ }).click();

    cy.log("field list view");
    cy.button(/Edit/).should("be.visible").realClick();

    cy.log("field list view (metabase#55618)");
    cy.findAllByPlaceholderText("Select a target")
      .should("have.length", 2)
      .eq(0)
      .should("have.value", "People → ID");
    cy.findAllByPlaceholderText("Select a target")
      .eq(1)
      .should("have.value", "Products → ID");
    cy.findAllByPlaceholderText("Select a target").eq(0).click();
    H.popover().within(() => {
      cy.findByText("Orders → ID").should("be.visible");
      cy.findByText("People → ID").should("be.visible");
      cy.findByText("Products → ID").should("be.visible");
      cy.findByText("Reviews → ID").should("be.visible").click();
    });
    cy.findAllByPlaceholderText("Select a target")
      .eq(0)
      .should("have.value", "Reviews → ID");

    cy.log("field list view (metabase#55617)");
    cy.findAllByPlaceholderText("Select a semantic type")
      .eq(6)
      .should("have.value", "Discount")
      .click();
    H.popover().findByText("No semantic type").click();
    cy.findAllByPlaceholderText("Select a semantic type")
      .eq(6)
      .should("have.value", "No semantic type");

    cy.log("field detail view");
    cy.button("Cancel").click();
    cy.findByRole("link", { name: /User ID/ }).click();

    cy.log("field detail view (metabase#55618)");
    cy.button(/Edit/).should("be.visible").realClick();
    cy.findByPlaceholderText("Select a target")
      .should("have.value", "People → ID")
      .click();
    H.main().scrollTo("bottom"); // scroll to bottom so the popover drops up
    H.popover().within(() => {
      cy.findByText("Orders → ID").should("exist");
      cy.findByText("People → ID").should("exist");
      cy.findByText("Products → ID").should("exist");
      cy.findByText("Reviews → ID").should("exist").click();
    });
    cy.findByPlaceholderText("Select a target").should(
      "have.value",
      "Reviews → ID",
    );

    cy.log("field detail view (metabase#55617)");
    cy.findByPlaceholderText("Select a semantic type")
      .should("have.value", "Foreign Key")
      .click();
    H.popover().findByText("No semantic type").click();
    cy.findByPlaceholderText("Select a semantic type").should(
      "have.value",
      "No semantic type",
    );
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
