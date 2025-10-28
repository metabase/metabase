const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

H.describeWithSnowplow("scenarios > browse", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  it("can browse to a table in a database", () => {
    cy.visit("/");
    H.browseDatabases().click();
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Products" }).click();
    cy.findByRole("button", { name: /Summarize/ });
    cy.findByRole("link", { name: /Sample Database/ }).click();
    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "browse_data_table_clicked",
      table_id: PRODUCTS_ID,
    });
  });

  it("can generate x-ray dashboard from a browse page", () => {
    cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);

    cy.findByTestId("browse-schemas").within(() => {
      cy.findAllByRole("link")
        .filter(":contains(People)")
        .should("be.visible")
        .realHover();
      cy.findAllByLabelText("X-ray this table").filter(":visible").click();
    });

    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "x-ray_clicked",
      event_detail: "table",
      triggered_from: "browse_database",
    });
  });

  it("tracks when a new metric creation is initiated", () => {
    cy.visit("/browse/metrics");
    cy.findByTestId("browse-metrics-header")
      .findByLabelText("Create a new metric")
      .should("be.visible")
      .click();
    cy.findByTestId("entity-picker-modal").should("be.visible");

    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "plus_button_clicked",
      triggered_from: "metric",
    });
  });

  it("browsing to a database only triggers a request for schemas for that specific database", () => {
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/schemas`).as(
      "schemasForSampleDatabase",
    );
    cy.intercept(
      "GET",
      /\/api\/database\/(?!1\b)\d+\/schemas/,
      cy.spy().as("schemasForOtherDatabases"),
    );
    cy.visit("/");
    H.browseDatabases().click();
    cy.findByRole("link", { name: /Sample Database/ }).click();
    cy.wait("@schemasForSampleDatabase");
    cy.get("@schemasForOtherDatabases").should("not.have.been.called");
  });

  it("can visit 'Learn about our data' page", () => {
    cy.visit("/");
    H.browseDatabases().click();
    cy.findByRole("link", { name: /Learn about our data/ }).click();
    cy.location("pathname").should("eq", "/reference/databases");
    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "learn_about_our_data_clicked",
    });
    cy.go("back");
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Products" }).click();
    cy.findByRole("gridcell", { name: "Rustic Paper Wallet" });
  });

  it("The Browse metrics page shows an error message if the search endpoint throws an error", () => {
    cy.visit("/");
    cy.intercept("GET", "/api/search*", (req) => {
      req.reply({ statusCode: 400 });
    });
    H.navigationSidebar().findByLabelText("Browse metrics").click();
    cy.findByLabelText("Metrics")
      .findByText("An error occurred")
      .should("be.visible");
  });
});

describe("issue 37907", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
  });

  it("allows to change field descriptions in data reference page (metabase#37907)", () => {
    cy.visit("/");
    H.browseDatabases().click();
    cy.findByRole("link", { name: /Learn about our data/ }).click();
    cy.findByTestId("data-reference-list-item").click();
    cy.findByRole("link", { name: /Tables in Sample Database/ }).click();
    cy.findAllByTestId("data-reference-list-item").findByText("Orders").click();
    cy.findByRole("link", { name: /Fields in this table/ }).click();
    cy.button(/Edit/).realClick(); // click() does not work
    cy.findAllByPlaceholderText("No column description yet")
      .eq(0)
      .clear()
      .type("My ID column");
    cy.findAllByPlaceholderText("No column description yet")
      .eq(5)
      .focus()
      .type(" Updated.");
    cy.button(/Save/).realClick(); // click() does not work
    cy.wait(["@fieldUpdate", "@fieldUpdate"]);

    cy.get("main").within(() => {
      cy.findByText("My ID column").should("be.visible");
      cy.findByText("The total billed amount. Updated.").should("be.visible");
      cy.findByText("Discount amount.").scrollIntoView().should("be.visible");
    });

    H.visitQuestion(ORDERS_QUESTION_ID);

    H.tableInteractive().findByTextEnsureVisible("ID").realHover();
    H.popover().should("include.text", "My ID column");

    H.tableInteractive().findByTextEnsureVisible("Total").realHover();
    H.popover().should("include.text", "The total billed amount. Updated.");

    H.tableInteractive().findByTextEnsureVisible("Discount ($)").realHover();
    H.popover().should("include.text", "Discount amount.");
  });
});
