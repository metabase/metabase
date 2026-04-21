const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > reference > databases", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should see the listing", () => {
    cy.visit("/reference/databases");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sample Database");
  });

  xit("should let the user navigate to details", () => {
    cy.visit("/reference/databases");
    cy.contains("Sample Database").click();
    cy.contains("Why this database is interesting");
  });

  it("should let an admin edit details about the database", () => {
    cy.visit("/reference/databases/1");

    // For some unknown reason, calling .click() causes the form to immediately reset, putting us
    // in a state like we never clicked the edit button TODO: Fix
    cy.button(/Edit/).trigger("click");
    // Q - is there any cleaner way to get a nearby element without having to know the DOM?
    cy.findByPlaceholderText("No description yet").type("A pretty ok store");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("A pretty ok store");
  });

  it("should let an admin start to edit and cancel without saving", () => {
    cy.visit("/reference/databases/1");
    // For some unknown reason, calling .click() causes the form to immediately reset, putting us
    // in a state like we never clicked the edit button TODO: Fix
    cy.button(/Edit/).trigger("click");
    // Q - is there any cleaner way to get a nearby element without having to know the DOM?
    cy.findByPlaceholderText("Nothing interesting yet").type(
      "Turns out it's not",
    );
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Cancel").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Turns out").should("have.length", 0);
  });

  it("should let an admin edit the database name", () => {
    cy.visit("/reference/databases/1");
    // For some unknown reason, calling .click() causes the form to immediately reset, putting us
    // in a state like we never clicked the edit button TODO: Fix
    cy.button(/Edit/).trigger("click");

    cy.findByPlaceholderText("Sample Database")
      .clear()
      .type("My definitely profitable business");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("My definitely profitable business");
  });

  describe("multiple databases sorting order", () => {
    beforeEach(() => {
      ["d", "b", "a", "c"].forEach((name) => {
        cy.addSQLiteDatabase({ name });
      });
    });

    it(
      "should sort data reference database list (metabase#15598)",
      { tags: "@skip" },
      () => {
        cy.visit("/browse");
        checkReferenceDatabasesOrder();

        cy.visit("/reference/databases/");
        checkReferenceDatabasesOrder();
      },
    );

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

    it(
      "should sort databases in new native question data selection popover",
      { tags: "@skip" },
      () => {
        checkQuestionSourceDatabasesOrder("Native query");
      },
    );
  });

  describe("x-ray", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/automagic-dashboards/**").as(
        "getXrayDashboard",
      );
      H.resetSnowplow();
      H.restore();
      cy.signInAsAdmin();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should x-ray a table in a data reference page", () => {
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
    });

    it("should x-ray a field in a data reference page", () => {
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

function checkReferenceDatabasesOrder() {
  cy.get("[class*=Card]").as("databaseCard").first().should("have.text", "a");
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.get("@databaseCard").last().should("have.text", "Sample Database");
}

function checkQuestionSourceDatabasesOrder() {
  // Last item is "Saved Questions" for UI based questions so we have to check for the one before that (-2), and the last one for "Native" (-1)
  const lastDatabaseIndex = -1;
  const selector = "[data-element-id=list-item]-title";

  H.startNewQuestion();
  H.popover().within(() => {
    cy.findByText("Raw Data").click();
    cy.get(selector).as("databaseName").eq(1).should("have.text", "a");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.get("@databaseName")
      .eq(lastDatabaseIndex)
      .should("have.text", "Sample Database");
  });
}
