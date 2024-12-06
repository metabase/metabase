import { H } from "e2e/support";
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

  function select(name) {
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
