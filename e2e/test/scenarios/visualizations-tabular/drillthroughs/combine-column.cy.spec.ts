import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

cy.describeWithSnowplow(
  "scenarios > visualizations > drillthroughs > table_drills > combine columns",
  () => {
    beforeEach(() => {
      cy.restore();
      cy.resetSnowplow();
      cy.signInAsAdmin();
    });

    afterEach(() => {
      cy.expectNoBadSnowplowEvents();
    });

    it("should be possible to combine columns from the a table header", () => {
      cy.createQuestion(
        {
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ID, { "base-type": "type/Number" }],
              ["field", PEOPLE.EMAIL, { "base-type": "type/Text" }],
            ],
            limit: 3,
          },
        },
        { visitQuestion: true },
      );

      cy.tableHeaderClick("Email");
      cy.popover().findByText("Combine columns").click();

      cy.popover().within(() => {
        cy.findByTestId("combine-example").should(
          "contain",
          "email@example.com12345",
        );
        cy.findByText("ID").click();
      });

      cy.popover().last().findByText("Name").click();

      cy.popover().within(() => {
        cy.findByText("Separated by (empty)").click();
        cy.findByLabelText("Separator").type("__");
        cy.findByTestId("combine-example").should(
          "have.text",
          "email@example.com__text",
        );

        cy.findByText("Add column").click();
        cy.findByTestId("combine-example").should(
          "have.text",
          "email@example.com__text__12345",
        );

        cy.findAllByRole("textbox").last().clear();
        cy.findByTestId("combine-example").should(
          "have.text",
          "email@example.com__text12345",
        );

        cy.findAllByRole("textbox").last().clear().type("+");
        cy.findByTestId("combine-example").should(
          "have.text",
          "email@example.com__text+12345",
        );

        cy.findByText("Done").click();
      });

      cy.findAllByTestId("header-cell")
        .last()
        .should("have.text", "Combined Email, Name, ID");

      cy.expectGoodSnowplowEvent({
        event: "column_combine_via_column_header",
        custom_expressions_used: ["concat"],
        database_id: SAMPLE_DB_ID,
      });
    });

    it("should handle duplicate column names", () => {
      cy.createQuestion(
        {
          query: {
            "source-table": PEOPLE_ID,
            fields: [
              ["field", PEOPLE.ID, { "base-type": "type/Number" }],
              ["field", PEOPLE.EMAIL, { "base-type": "type/Text" }],
            ],
            limit: 3,
          },
        },
        { visitQuestion: true },
      );

      // first combine (email + ID)
      cy.tableHeaderClick("Email");
      cy.popover().findByText("Combine columns").click();
      cy.popover().findByText("Done").click();

      // second combine (email + ID)
      cy.tableHeaderClick("Email");
      cy.popover().findByText("Combine columns").click();
      cy.popover().findByText("Done").click();

      cy.findAllByTestId("header-cell")
        .contains("Combined Email, ID")
        .should("exist");
      cy.findAllByTestId("header-cell")
        .contains("Combined Email, ID_2")
        .should("exist");
    });
  },
);
