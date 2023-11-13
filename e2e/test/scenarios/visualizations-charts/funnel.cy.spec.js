import {
  restore,
  visitQuestionAdhoc,
  sidebar,
  getDraggableElements,
  moveColumnDown,
  popover,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    cy.findByTestId("viz-settings-button").click();
    sidebar().findByText("Data").click();
  });

  it("hould allow you to reorder and show/hide rows", () => {
    cy.log("ensure that rows are shown");
    getDraggableElements().should("have.length", 5);

    getDraggableElements()
      .first()
      .invoke("text")
      .then(name => {
        cy.log(`mode row ${name} down 2`);
        cy.findAllByTestId("funnel-chart-header")
          .first()
          .should("have.text", name);

        moveColumnDown(getDraggableElements().first(), 2);

        getDraggableElements().eq(2).should("have.text", name);

        cy.findAllByTestId("funnel-chart-header")
          .eq(2)
          .should("have.text", name);
      });

    cy.log("toggle row visibility");
    getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_outline").click();
      });
    cy.findAllByTestId("funnel-chart-header").should("have.length", 4);

    getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_crossed_out").click();
      });
    cy.findAllByTestId("funnel-chart-header").should("have.length", 5);
  });

  it("should handle row items being filterd out and returned gracefully", () => {
    moveColumnDown(getDraggableElements().first(), 2);

    getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_outline").click();
      });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();

    cy.findByTestId("filter-field-Source").within(() => {
      cy.findByTestId("operator-select").click();
    });

    popover().within(() => {
      cy.findByText("Is not").click();
    });

    cy.findByTestId("filter-field-Source").within(() => {
      cy.findByText("Facebook").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Apply Filters").click();

    getDraggableElements().should("have.length", 4);

    //Ensures that "Google" is still hidden, so it's state hasn't changed.
    getDraggableElements()
      .eq(0)
      .within(() => {
        cy.icon("eye_crossed_out").click();
      });

    cy.log("remove filter");

    cy.findByTestId("qb-filters-panel").within(() => {
      cy.icon("close").click();
    });

    getDraggableElements().should("have.length", 5);

    //Re-added items should appear at the end of the list.
    getDraggableElements().eq(0).should("have.text", "Google");
    getDraggableElements().eq(4).should("have.text", "Facebook");
  });
});
