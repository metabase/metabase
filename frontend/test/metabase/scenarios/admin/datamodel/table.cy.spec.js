import { signInAsAdmin, restore } from "__support__/cypress";

const ORDERS_URL = "/admin/datamodel/database/1/table/2";

describe("admin > datamodel > table", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
    cy.server();
    cy.route("PUT", "/api/table/*").as("tableUpdate");
    cy.route("PUT", "/api/field/*").as("fieldUpdate");
  });

  describe("data model editor", () => {
    it("should allow editing of the name and description", () => {
      cy.visit(ORDERS_URL);

      cy.get('input[name="display_name"]').as("display_name");
      cy.get('input[name="description"]').as("description");

      // update the name
      cy.get("@display_name")
        .should("have.value", "Orders")
        .clear()
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
        .type("new description")
        .blur();
      cy.wait("@tableUpdate");

      // reload and verify they have been updated
      cy.reload();
      cy.get("@display_name").should("have.value", "new display_name");
      cy.get("@description").should("have.value", "new description");
    });

    it("shouild allow changing the visibility and reason", () => {
      cy.visit(ORDERS_URL);

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
      cy.get(".PopoverBody")
        .contains(desiredOption)
        .click({ force: true });
      cy.get(alias).contains(desiredOption);

      cy.wait("@fieldUpdate");

      cy.reload();
      cy.get(alias).contains(desiredOption);
    }

    it("should allow hiding of columns", () => {
      cy.visit(ORDERS_URL);

      field("Created At").as("created_at");
      testSelect("@created_at", "Everywhere", "Only in detail views");
    });

    it("should allow changing of special type and currency", () => {
      cy.visit(ORDERS_URL);

      field("Tax").as("tax");
      testSelect("@tax", "No special type", "Currency");
      testSelect("@tax", "US Dollar", "Canadian Dollar");
    });

    it("should allow changing of foreign key target", () => {
      cy.visit(ORDERS_URL);

      field("User ID").as("user_id");
      testSelect("@user_id", "People → ID", "Products → ID");
    });

    it("should allow creating segments", () => {
      cy.visit(ORDERS_URL);

      cy.contains("Add a Segment").click();

      cy.url().should("include", "/admin/datamodel/segment/create?table=2");

      cy.contains("Add filters to narrow your answer").click();
      cy.contains("Product ID").click();
      cy.get(`input[placeholder="Enter an ID"]`)
        .type("1")
        .blur();
      cy.contains("button", "Add filter").click();
      cy.contains("93 rows");
      cy.get(`input[placeholder^="Something descriptive"]`).type(
        "User 1's Orders",
      );
      cy.get(`textarea[placeholder^="This is a good place"]`).type(
        "Segment containing only user 1's orders",
      );
      cy.contains("button", "Save changes").click();

      cy.url().should("include", "/admin/datamodel/database/1/table/2");
      cy.contains("User 1's Orders");
    });

    it("should allow creating metrics", () => {
      cy.visit(ORDERS_URL);

      cy.contains("Add a Metric").click();

      cy.url().should("include", "/admin/datamodel/metric/create?table=2");

      cy.contains("Count of rows").click();
      cy.contains("Sum of").click();
      cy.contains("Subtotal").click();
      cy.contains("Result: 1448188");
      cy.get(`input[placeholder^="Something descriptive"]`).type("Revenue");
      cy.get(`textarea[placeholder^="This is a good place"]`).type(
        "Total revenue",
      );
      cy.contains("button", "Save changes").click();

      cy.url().should("include", "/admin/datamodel/database/1/table/2");
      cy.contains("Revenue");
    });
  });
});
