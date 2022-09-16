import { restore, visitQuestionAdhoc, sidebar } from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > visualizations > funnel chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.SOURCE]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "funnel",
    });
    cy.findByText("Settings").click();
    sidebar().findByText("Data").click();
  });

  it("should show the list of rows", () => {
    cy.findAllByTestId(/draggable-item/).should("have.length", 5);
  });

  it("should allow you to reorder rows", async () => {
    cy.findAllByTestId(/draggable-item/)
      .first()
      .invoke("text")
      .then(name => {
        cy.findAllByTestId("funnel-chart-header")
          .first()
          .should("have.text", name);

        moveColumnDown(cy.findAllByTestId(/draggable-item/).first(), 2);

        cy.findAllByTestId(/draggable-item/)
          .eq(2)
          .should("have.text", name);

        cy.findAllByTestId("funnel-chart-header")
          .eq(2)
          .should("have.text", name);
      });
  });

  it("should allow you toggle row visibility", async () => {
    cy.findAllByTestId(/draggable-item/)
      .eq(1)
      .find(".Icon-eye_filled")
      .click();
    cy.findAllByTestId("funnel-chart-header").should("have.length", 4);

    cy.findAllByTestId(/draggable-item/)
      .eq(1)
      .find(".Icon-eye_crossed_out")
      .click();

    cy.findAllByTestId("funnel-chart-header").should("have.length", 5);
  });
});

function moveColumnDown(column, distance) {
  column
    .trigger("mousedown", 0, 0, { force: true })
    .trigger("mousemove", 5, 5, { force: true })
    .trigger("mousemove", 0, distance * 50, { force: true })
    .trigger("mouseup", 0, distance * 50, { force: true });
}
