const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > drillthroughs > table_drills > combine columns", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should be possible to combine columns from the a table header", () => {
    H.createQuestion(
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

    H.tableHeaderClick("Email");
    H.popover().findByText("Combine columns").click();

    H.popover().within(() => {
      cy.findByTestId("combine-example").should(
        "contain",
        "email@example.com12345",
      );
      cy.findByText("ID").click();
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover().last().findByText("Name").click();

    H.popover().within(() => {
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

      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByRole("textbox").last().clear();
      cy.findByTestId("combine-example").should(
        "have.text",
        "email@example.com__text12345",
      );

      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByRole("textbox").last().clear().type("+");
      cy.findByTestId("combine-example").should(
        "have.text",
        "email@example.com__text+12345",
      );

      cy.findByText("Done").click();
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("header-cell")
      .last()
      .should("have.text", "Combined Email, Name, ID");

    H.expectUnstructuredSnowplowEvent({
      event: "column_combine_via_column_header",
      custom_expressions_used: ["concat"],
      database_id: SAMPLE_DB_ID,
    });
  });

  it("should handle duplicate column names", () => {
    H.createQuestion(
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
    H.tableHeaderClick("Email");
    H.popover().findByText("Combine columns").click();
    H.popover().findByText("Done").click();

    // second combine (email + ID)
    H.tableHeaderClick("Email");
    H.popover().findByText("Combine columns").click();
    H.popover().findByText("Done").click();

    cy.findAllByTestId("header-cell")
      .contains("Combined Email, ID")
      .should("exist");
    cy.findAllByTestId("header-cell")
      .contains("Combined Email, ID_2")
      .should("exist");
  });
});
