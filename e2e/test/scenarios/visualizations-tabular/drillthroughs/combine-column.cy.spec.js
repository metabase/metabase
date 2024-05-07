import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  popover,
  resetSnowplow,
  restore,
} from "e2e/support/helpers";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describeWithSnowplow(
  "scenarios > visualizations > drillthroughs > table_drills > combine columns",
  () => {
    beforeEach(() => {
      restore();
      resetSnowplow();
      cy.signInAsAdmin();
    });

    afterEach(() => {
      expectNoBadSnowplowEvents();
    });

    it("should be possible to combine columns from the a table header", () => {
      createQuestion(
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

      cy.findAllByTestId("header-cell").contains("Email").click();
      popover().findByText("Combine columns").click();

      popover().within(() => {
        cy.findByTestId("combine-column-example").should(
          "contain",
          "email@example.com12345",
        );
        cy.findByText("ID").click();
      });

      popover().last().findByText("Name").click();

      popover().within(() => {
        cy.findByText("Separated by (empty)").click();
        cy.findByLabelText("Separator").type("__");
        cy.findByTestId("combine-column-example").should(
          "have.text",
          "email@example.com__text",
        );

        cy.findByText("Add column").click();
        cy.findByTestId("combine-column-example").should(
          "have.text",
          "email@example.com__text__12345",
        );

        cy.findAllByRole("textbox").last().clear();
        cy.findByTestId("combine-column-example").should(
          "have.text",
          "email@example.com__text12345",
        );

        cy.findAllByRole("textbox").last().clear().type("+");
        cy.findByTestId("combine-column-example").should(
          "have.text",
          "email@example.com__text+12345",
        );

        cy.findByText("Done").click();
      });

      cy.findAllByTestId("header-cell")
        .last()
        .should("have.text", "Email Name ID");

      expectGoodSnowplowEvent({
        event: "column_combine_via_column_header",
        custom_expressions_used: ["concat"],
        database_id: SAMPLE_DB_ID,
      });
    });

    it("should handle duplicate column names", () => {
      createQuestion(
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
      cy.findAllByTestId("header-cell").contains("Email").click();
      popover().findByText("Combine columns").click();
      popover().findByText("Done").click();

      // second combine (email + ID)
      cy.findAllByTestId("header-cell").contains("Email").click();
      popover().findByText("Combine columns").click();
      popover().findByText("Done").click();

      cy.findAllByTestId("header-cell").contains("Email ID").should("exist");
      cy.findAllByTestId("header-cell").contains("Email ID_2").should("exist");
    });
  },
);
