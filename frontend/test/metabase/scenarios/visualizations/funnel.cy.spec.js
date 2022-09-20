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

  it("hould allow you to reorder and show/hide rows", () => {
    cy.log("ensure that rows are shown");
    getDraggableRows().should("have.length", 5);

    getDraggableRows()
      .first()
      .invoke("text")
      .then(name => {
        cy.log(`mode row ${name} down 2`);
        cy.findAllByTestId("funnel-chart-header")
          .first()
          .should("have.text", name);

        moveColumnDown(getDraggableRows().first(), 2);

        getDraggableRows().eq(2).should("have.text", name);

        cy.findAllByTestId("funnel-chart-header")
          .eq(2)
          .should("have.text", name);
      });

    cy.log("toggle row visibility");
    getDraggableRows()
      .eq(1)
      .within(() => {
        cy.icon("eye_filled").click();
      });
    cy.findAllByTestId("funnel-chart-header").should("have.length", 4);

    getDraggableRows()
      .eq(1)
      .within(() => {
        cy.icon("eye_crossed_out").click();
      });
    cy.findAllByTestId("funnel-chart-header").should("have.length", 5);
  });
});

function getDraggableRows() {
  return cy.findAllByTestId(/draggable-item/);
}

function moveColumnDown(column, distance) {
  column
    .trigger("mousedown", 0, 0, { force: true })
    .trigger("mousemove", 5, 5, { force: true })
    .trigger("mousemove", 0, distance * 50, { force: true })
    .trigger("mouseup", 0, distance * 50, { force: true });
}
