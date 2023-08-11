import { restore } from "e2e/support/helpers";

describe("issue 33113", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  const twoColumnQuery =
    "select category, count(*) as count from products group by category order by count desc";
  const threeColumnQuery =
    "select category, count(*) as count, sum(price) as price from products group by category order by count desc";

  describe("should not change chart type from pie or funnel when changing from 2 columns to 3 columns on a native question (metabase#33113)", () => {
    it("funnel chart", () => {
      cy.createNativeQuestion(
        {
          native: {
            query: twoColumnQuery,
          },
          display: "funnel",
          visualization_settings: {
            "funnel.dimension": "CATEGORY",
            "funnel.metric": "COUNT",
          },
        },
        { visitQuestion: true },
      );
      cy.findByTestId("funnel-chart");
      cy.findByTestId("query-builder-main").findByText("Open Editor").click();
      cy.findByTestId("native-query-editor").type(
        `{selectall}${threeColumnQuery}`,
        { delay: 0 },
      );
      cy.findByTestId("native-query-editor-sidebar").within(() => {
        cy.icon("play").click();
      });
      cy.findByTestId("funnel-chart");
    });

    it("pie chart", () => {
      cy.createNativeQuestion(
        {
          native: {
            query: twoColumnQuery,
          },
          display: "pie",
          visualization_settings: {
            "pie.dimension": "CATEGORY",
            "pie.metric": "COUNT",
          },
        },
        { visitQuestion: true },
      );
      cy.findByTestId("pie-chart");
      cy.findByTestId("query-builder-main").findByText("Open Editor").click();
      cy.findByTestId("native-query-editor").type(
        `{selectall}${threeColumnQuery}`,
        { delay: 0 },
      );
      cy.findByTestId("native-query-editor-sidebar").within(() => {
        cy.icon("play").click();
      });
      cy.findByTestId("pie-chart");
    });
  });
});
