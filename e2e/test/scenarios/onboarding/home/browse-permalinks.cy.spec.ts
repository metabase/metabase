const { H } = cy;

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("browse > name-based urls > databases", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("uses the name url when clicking through, and resolves that url directly", () => {
    cy.visit("/browse/databases");
    cy.findByTestId("database-browser").findByText("Sample Database").click();

    cy.location("pathname").should("eq", "/browse/databases/Sample%20Database");
    cy.findByRole("heading", { name: "Orders" }).should("be.visible");

    cy.visit("/browse/databases/Sample%20Database");

    cy.findByRole("heading", { name: "Orders" }).should("be.visible");
    cy.location("pathname").should("eq", "/browse/databases/Sample%20Database");
  });

  it("resolves the id-slug url", () => {
    cy.visit(`/browse/databases/${SAMPLE_DB_ID}-sample-database`);

    cy.findByRole("heading", { name: "Orders" }).should("be.visible");
  });

  it("shows not-found for a user without access to the database", () => {
    cy.signIn("nodata");
    cy.visit("/browse/databases/Sample%20Database");

    cy.findByLabelText("error page").should("be.visible");
  });
});

describe("browse > name-based urls > schemas", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("opens a schema from database + schema names, keeping the name url", () => {
    cy.visit("/browse/databases/Sample%20Database/schema/PUBLIC");

    cy.findByRole("heading", { name: "Orders" }).should("be.visible");
    cy.location("pathname").should(
      "eq",
      "/browse/databases/Sample%20Database/schema/PUBLIC",
    );
  });

  it("shows not-found for a user without access to the schema's database", () => {
    cy.signIn("nodata");
    cy.visit("/browse/databases/Sample%20Database/schema/PUBLIC");

    cy.findByLabelText("error page").should("be.visible");
  });
});

describe("browse > name-based urls > tables", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("redirects a table name url to the query builder", () => {
    cy.visit("/browse/databases/Sample%20Database/schema/PUBLIC/table/ORDERS");

    cy.findByRole("button", { name: /Summarize/ }).should("be.visible");
    cy.location("pathname").should("eq", `/table/${ORDERS_ID}-orders`);
  });

  it("shows not-found for a user without access to the table", () => {
    cy.signIn("nodata");
    cy.visit("/browse/databases/Sample%20Database/schema/PUBLIC/table/ORDERS");

    cy.findByLabelText("error page").should("be.visible");
  });
});

describe(
  "browse > name-based urls > schema-less database",
  { tags: "@mongo" },
  () => {
    beforeEach(() => {
      H.restore("mongo-5");
      cy.signInAsNormalUser();
    });

    it("redirects a table name url with no schema segment to the query builder", () => {
      cy.visit("/browse/databases/QA%20Mongo/table/orders");

      cy.findByRole("button", { name: /Summarize/ }).should("be.visible");
      cy.location("pathname").should("match", /^\/table\/\d+/);
    });
  },
);
