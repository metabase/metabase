import { restore, popover, visitAlias } from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS_ID } = SAMPLE_DATASET;

const SAMPLE_DB_URL = "/admin/datamodel/database/1";

// [quarantine] flaky
describe.skip("scenarios > admin > datamodel > editor", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.server();
    cy.route("PUT", "/api/table/*").as("tableUpdate");
    cy.route("PUT", "/api/field/*").as("fieldUpdate");
    cy.wrap(`${SAMPLE_DB_URL}/table/${ORDERS_ID}`).as(`ORDERS_URL`);
  });

  it("should allow editing of the name and description", () => {
    cy.route(
      "GET",
      "/api/table/2/query_metadata?include_sensitive_fields=true",
    ).as("tableMetadataFetch");
    visitAlias("@ORDERS_URL");

    cy.get('input[name="display_name"]').as("display_name");
    cy.get('input[name="description"]').as("description");

    cy.wait("@tableMetadataFetch");

    // update the name
    cy.get("@display_name")
      .should("have.value", "Orders")
      .clear()
      .should("have.value", "")
      .type("new display_name")
      .blur();
    cy.wait("@tableUpdate");

    // update the description
    cy.get("@description")
      .should(
        "have.value",
        "This is a confirmed order for a product from a user.",
      )
      .clear()
      .should("have.value", "")
      .type("new description")
      .blur();
    cy.wait("@tableUpdate");

    // reload and verify they have been updated
    cy.reload();
    cy.get("@display_name").should("have.value", "new display_name");
    cy.get("@description").should("have.value", "new description");
  });

  it("shouild allow changing the visibility and reason", () => {
    visitAlias("@ORDERS_URL");

    // visibility
    cy.contains(/^Queryable$/).should("have.class", "text-brand");
    cy.contains(/^Hidden$/).should("not.have.class", "text-brand");

    cy.contains(/^Hidden$/).click();
    cy.wait("@tableUpdate");

    cy.reload();
    cy.contains(/^Queryable$/).should("not.have.class", "text-brand");
    cy.contains(/^Hidden$/).should("have.class", "text-brand");

    // hidden reason
    cy.contains("Technical Data").should("not.have.class", "text-brand");
    cy.contains("Technical Data").click();
    cy.wait("@tableUpdate");

    cy.reload();
    cy.contains("Technical Data").should("have.class", "text-brand");

    // check that it still appears in the sidebar on the db page
    cy.visit(SAMPLE_DB_URL);
    cy.contains("1 Hidden Table");
    cy.contains("Orders");
  });

  function field(name) {
    return cy
      .get(`input[value="${name}"]`)
      .parent()
      .parent();
  }

  function testSelect(alias, initialOption, desiredOption) {
    cy.get(alias)
      .contains(initialOption)
      .click({ force: true });
    popover()
      .contains(desiredOption)
      .click({ force: true });
    cy.get(alias).contains(desiredOption);

    cy.wait("@fieldUpdate");

    cy.reload();
    cy.get(alias).contains(desiredOption);
  }

  it("should allow hiding of columns outside of detail views", () => {
    visitAlias("@ORDERS_URL");

    field("Created At").as("created_at");
    testSelect("@created_at", "Everywhere", "Only in detail views");
  });

  it("should allow hiding of columns entirely", () => {
    visitAlias("@ORDERS_URL");

    field("Created At").as("created_at");
    testSelect("@created_at", "Everywhere", "Do not include");

    // click over to products and back so we refresh the columns
    cy.contains("Products").click();
    cy.url().should("include", "/admin/datamodel/database/1/table/1");
    cy.contains("Orders").click();

    // created at should still be there
    field("Created At");
  });

  it("should allow changing of semantic type and currency", () => {
    visitAlias("@ORDERS_URL");

    field("Tax").as("tax");
    testSelect("@tax", "No semantic type", "Currency");
    testSelect("@tax", "US Dollar", "Canadian Dollar");
  });

  it("should allow changing of foreign key target", () => {
    visitAlias("@ORDERS_URL");

    field("User ID").as("user_id");
    testSelect("@user_id", "People → ID", "Products → ID");
  });

  it("should allow sorting columns", () => {
    cy.route("PUT", "/api/table/2/fields/order").as("fieldReorder");

    visitAlias("@ORDERS_URL");
    cy.contains("Column order:").click();

    // switch to alphabetical ordering
    popover()
      .contains("Alphabetical")
      .click({ force: true });

    cy.wait("@tableUpdate");

    // move product_id to the top
    cy.get(".Grabber")
      .eq(3)
      .trigger("mousedown", 0, 0);
    cy.get("#ColumnsList")
      .trigger("mousemove", 10, 10)
      .trigger("mouseup", 10, 10);

    // wait for request to complete
    cy.wait("@fieldReorder");

    // check that new order is obeyed in queries
    cy.request("POST", "/api/dataset", {
      database: 1,
      query: { "source-table": ORDERS_ID },
      type: "query",
    }).then(resp => {
      expect(resp.body.data.cols[0].name).to.eq("PRODUCT_ID");
    });
  });

  it("should allow bulk hiding tables", () => {
    visitAlias("@ORDERS_URL");

    cy.findByText("4 Queryable Tables");
    cy.get(".AdminList-section .Icon-eye_crossed_out").click();
    cy.findByText("4 Hidden Tables");
    cy.get(".AdminList-section .Icon-eye").click();
    cy.findByText("4 Queryable Tables");
  });
});
