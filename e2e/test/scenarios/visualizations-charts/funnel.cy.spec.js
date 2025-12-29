const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > visualizations > funnel chart", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.visitQuestionAdhoc({
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
    H.openVizSettingsSidebar();
    H.sidebar().findByText("Data").click();
  });

  it("should allow you to reorder and show/hide rows", () => {
    cy.log("ensure that rows are shown");
    H.getDraggableElements().should("have.length", 5);

    H.getDraggableElements()
      .first()
      .invoke("text")
      .then((name) => {
        cy.log(`mode row ${name} down 2`);
        cy.findAllByTestId("funnel-chart-header")
          .first()
          .should("have.text", name);

        H.getDraggableElements().first().as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
          vertical: 100,
        });

        H.getDraggableElements().eq(2).should("have.text", name);

        cy.findAllByTestId("funnel-chart-header")
          .eq(2)
          .should("have.text", name);
      });

    cy.log("toggle row visibility");
    H.getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_outline").click({ force: true });
      });
    cy.findAllByTestId("funnel-chart-header").should("have.length", 4);

    H.getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_crossed_out").click({ force: true });
      });
    cy.findAllByTestId("funnel-chart-header").should("have.length", 5);
  });

  it("should handle row items being filterd out and returned gracefully", () => {
    H.getDraggableElements().first().as("dragElement");
    H.moveDnDKitElementByAlias("@dragElement", { vertical: 100 });

    H.getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_outline").click({ force: true });
      });

    H.filter();
    H.popover().findByText("Source").click();
    H.selectFilterOperator("Is not");
    H.popover().within(() => {
      cy.findByText("Facebook").click();
      cy.button("Apply filter").click();
    });

    H.getDraggableElements().should("have.length", 4);

    //Ensures that "Google" is still hidden, so it's state hasn't changed.
    H.getDraggableElements()
      .eq(0)
      .within(() => {
        cy.icon("eye_crossed_out").click({ force: true });
      });

    cy.log("remove filter");

    cy.findByTestId("qb-filters-panel").within(() => {
      cy.icon("close").click();
    });

    H.getDraggableElements().should("have.length", 5);

    //Re-added items should appear at the end of the list.
    H.getDraggableElements().eq(0).should("have.text", "Google");
    H.getDraggableElements().eq(4).should("have.text", "Facebook");
  });
});
