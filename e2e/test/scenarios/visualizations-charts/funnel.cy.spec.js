import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > visualizations > funnel chart", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();

    cy.visitQuestionAdhoc({
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
    cy.openVizSettingsSidebar();
    cy.sidebar().findByText("Data").click();
  });

  it("should allow you to reorder and show/hide rows", () => {
    cy.log("ensure that rows are shown");
    cy.getDraggableElements().should("have.length", 5);

    cy.getDraggableElements()
      .first()
      .invoke("text")
      .then(name => {
        cy.log(`mode row ${name} down 2`);
        cy.findAllByTestId("funnel-chart-header")
          .first()
          .should("have.text", name);

        cy.moveDnDKitElement(cy.getDraggableElements().first(), {
          vertical: 100,
        });

        cy.getDraggableElements().eq(2).should("have.text", name);

        cy.findAllByTestId("funnel-chart-header")
          .eq(2)
          .should("have.text", name);
      });

    cy.log("toggle row visibility");
    cy.getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_outline").click({ force: true });
      });
    cy.findAllByTestId("funnel-chart-header").should("have.length", 4);

    cy.getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_crossed_out").click({ force: true });
      });
    cy.findAllByTestId("funnel-chart-header").should("have.length", 5);
  });

  it("should handle row items being filterd out and returned gracefully", () => {
    cy.moveDnDKitElement(cy.getDraggableElements().first(), { vertical: 100 });

    cy.getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_outline").click({ force: true });
      });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();

    cy.findByTestId("filter-column-Source").within(() => {
      cy.findByLabelText("Filter operator").click();
    });

    cy.popover().within(() => {
      cy.findByText("Is not").click();
    });

    cy.findByTestId("filter-column-Source").within(() => {
      cy.findByText("Facebook").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Apply filters").click();

    cy.getDraggableElements().should("have.length", 4);

    //Ensures that "Google" is still hidden, so it's state hasn't changed.
    cy.getDraggableElements()
      .eq(0)
      .within(() => {
        cy.icon("eye_crossed_out").click({ force: true });
      });

    cy.log("remove filter");

    cy.findByTestId("qb-filters-panel").within(() => {
      cy.icon("close").click();
    });

    cy.getDraggableElements().should("have.length", 5);

    //Re-added items should appear at the end of the list.
    cy.getDraggableElements().eq(0).should("have.text", "Google");
    cy.getDraggableElements().eq(4).should("have.text", "Facebook");
  });
});
