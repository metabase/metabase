const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > reference > databases", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should let an admin browse and edit database details", () => {
    cy.visit("/reference/databases");
    cy.findByTestId("data-reference-list-item")
      .findByText("Sample Database")
      .click();
    H.main()
      .findByText("Why this database is interesting")
      .should("be.visible");
    cy.button(/Edit/).trigger("click");
    cy.findByPlaceholderText("No description yet").type("A pretty ok store");
    cy.findByPlaceholderText("Sample Database")
      .clear()
      .type("My definitely profitable business");
    cy.button("Save").click();
    H.main()
      .should("contain", "A pretty ok store")
      .and("contain", "My definitely profitable business");
  });

  it("should let an admin start to edit and cancel without saving", () => {
    cy.visit("/reference/databases/1");
    cy.button(/Edit/).trigger("click");
    cy.findByPlaceholderText("Nothing interesting yet")
      .invoke("val")
      .as("originalInterestingDetails");
    cy.findByPlaceholderText("Nothing interesting yet").type(
      "Turns out it's not",
    );
    cy.button("Cancel").click();
    cy.button(/Edit/).should("be.visible");
    H.main().should("not.contain", "Turns out it's not");
    cy.button(/Edit/).trigger("click");
    cy.get("@originalInterestingDetails").then((originalValue) => {
      cy.findByPlaceholderText("Nothing interesting yet").should(
        "have.value",
        originalValue,
      );
    });
  });

  describe("multiple databases sorting order", () => {
    beforeEach(() => {
      ["d", "b", "a", "c"].forEach((name) => {
        cy.addSQLiteDatabase({ name });
      });
    });

    it("should sort databases in new UI based question data selection popover", () => {
      H.startNewQuestion();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Databases").click();
        cy.findByTestId("item-picker-level-1").within(() => {
          cy.get("[data-index='0']").should("contain.text", "a");
          cy.get("[data-index='1']").should("contain.text", "b");
          cy.get("[data-index='2']").should("contain.text", "c");
          cy.get("[data-index='3']").should("contain.text", "d");
          cy.get("[data-index='4']").should("contain.text", "Sample Database");
        });
      });
    });
  });

  describe("x-ray", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/automagic-dashboards/**").as(
        "getXrayDashboard",
      );
      H.resetSnowplow();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should x-ray a table and a field in data reference pages", () => {
      cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${PEOPLE_ID}`);
      cy.findAllByRole("listitem")
        .filter(":contains(X-ray this table)")
        .click();
      cy.wait("@getXrayDashboard");

      H.expectUnstructuredSnowplowEvent({
        event: "x-ray_clicked",
        event_detail: "table",
        triggered_from: "data_reference",
      });

      cy.visit(
        `/reference/databases/${SAMPLE_DB_ID}/tables/${PEOPLE_ID}/fields/${PEOPLE.EMAIL}`,
      );
      cy.findAllByRole("listitem")
        .filter(":contains(X-ray this field)")
        .click();
      cy.wait("@getXrayDashboard");

      H.expectUnstructuredSnowplowEvent({
        event: "x-ray_clicked",
        event_detail: "field",
        triggered_from: "data_reference",
      });
    });
  });
});
