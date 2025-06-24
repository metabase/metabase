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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PEOPLE_ID}`,
    );

    cy.findByTestId("column-ADDRESS").find(".Icon-gear").click();

    cy.location("pathname").should(
      "eq",
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PEOPLE_ID}/field/${PEOPLE.ADDRESS}/general`,
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Address – Field Settings/i);
  });
});

describe("issue 21984", () => {
  const reviewsDataModelPage = `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${REVIEWS_ID}`;

  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata?**").as("tableMetadata");

    H.restore();
    cy.signInAsAdmin();

    cy.visit(reviewsDataModelPage);
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
      cy.findByText("Recent items").should("not.exist");
    });
  });
});

describe("issue 15542", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.wrap(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.PRODUCT_ID}/general`,
    ).as("ORDERS_PRODUCT_ID_URL");
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

  function exitAdmin() {
    // Navigate without reloading the page
    cy.findByText("Exit admin").click();
  }

  function openOrdersProductIdSettings() {
    // Navigate without reloading the page
    H.appBar().icon("gear").click();
    H.popover().findByText("Admin settings").click();

    H.appBar().findByText("Table Metadata").click();
    cy.findByText("Orders").click();

    cy.findByTestId("column-PRODUCT_ID").icon("gear").click();
  }

  function select(name: string) {
    return cy.findAllByTestId("select-button").contains(name);
  }

  it("should be possible to use the foreign key field display values immediately when changing the setting", () => {
    // This test does manual naviation instead of using openOrdersTable and similar
    // helpers because they use cy.visit under the hood and that reloads the page,
    // clearing the in-browser cache, which is what we are testing here.

    H.visitAlias("@ORDERS_PRODUCT_ID_URL");

    select("Plain input box").click();
    H.popover().findByText("A list of all values").click();

    select("Use original value").click();
    H.popover().findByText("Use foreign key").click();
    H.popover().findByText("Title").click();

    cy.wait("@fieldDimensionUpdate");

    exitAdmin();
    openOrdersTable();

    H.tableHeaderClick("Product ID");
    H.popover().findByText("Filter by this column").click();

    H.popover().within(() => {
      cy.findByText("1").should("not.exist");
      cy.findByText("Rustic Paper Wallet").should("be.visible");
    });

    openOrdersProductIdSettings();

    select("Use foreign key").click();
    H.popover().findByText("Use original value").click();

    exitAdmin();
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
    cy.visit("/admin/datamodel");
    cy.wait("@getSchema");
    cy.findAllByTestId("admin-metadata-table-list-item").eq(0).click();

    cy.findByTestId("column-ID")
      .findByPlaceholderText("Select a semantic type")
      .clear()
      .type("cu");

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
      .eq(8)
      .should("have.value", "Discount")
      .click();
    H.popover().findByText("No semantic type").click();
    cy.findAllByPlaceholderText("Select a semantic type")
      .eq(8)
      .should("have.value", "No semantic type");

    cy.log("field detail view");
    cy.button("Cancel").click();
    cy.findByRole("link", { name: /User ID/ }).click();

    cy.log("field detail view (metabase#55618)");
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
