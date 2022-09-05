import {
  restore,
  visitQuestion,
  popover,
  visitIframe,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

import {
  regularQuestion,
  questionWithAggregation,
  joinedQuestion,
} from "./embedding-questions";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > embedding > questions ", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Remap Product ID -> Product Title
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID as Title",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    // Do not include Subtotal anywhere
    cy.request("PUT", `/api/field/${ORDERS.SUBTOTAL}`, {
      visibility_type: "sensitive",
    });
  });

  it("should display the regular GUI question correctly", () => {
    const { name: title, description } = regularQuestion;

    cy.createQuestion(regularQuestion).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      visitQuestion(id);
    });

    cy.icon("share").click();
    cy.findByText("Embed this question in an application").click();

    visitIframe();

    cy.findByText(title);

    cy.icon("info").realHover();
    popover().contains(description);

    // Data model: Renamed column
    cy.findByText("Product ID as Title");
    // Data model: Display value changed to show FK
    cy.findByText("Awesome Concrete Shoes");
    // Custom column
    cy.findByText("Math");
    // Question settings: Renamed column
    cy.findByText("Billed");
    // Question settings: Column formating
    cy.findByText("€39.72");
    // Question settings: Abbreviated date, day enabled, 24H clock with seconds
    cy.findByText("Mon, Feb 11, 2019, 21:40:27");
    // Question settings: Show mini-bar
    cy.findAllByTestId("mini-bar");

    // Data model: Subtotal is turned off globally
    cy.findByText("Subtotal").should("not.exist");
  });

  it("should display the GUI question with aggregation correctly", () => {
    cy.createQuestion(questionWithAggregation).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      visitQuestion(id);
    });

    cy.icon("share").click();
    cy.findByText("Embed this question in an application").click();

    visitIframe();

    assertOnXYAxisLabels({ xLabel: "Created At", yLabel: "Count" });

    cy.get(".x.axis .tick")
      .should("have.length", 5)
      .and("contain", "Apr, 2016");

    cy.get(".y.axis .tick").should("contain", "60");

    // Check the tooltip for the last point on the line
    cy.get(".dot").last().realHover();

    popover().within(() => {
      testPairedTooltipValues("Created At", "Aug, 2016");
      testPairedTooltipValues("Math", "2");
      testPairedTooltipValues("Count", "79");
    });
  });

  it("should display the nested GUI question correctly", () => {
    cy.createQuestion(regularQuestion).then(({ body: { id } }) => {
      const nestedQuestion = {
        query: { "source-table": `card__${id}`, limit: 10 },
      };

      cy.createQuestion(nestedQuestion).then(({ body: { id: nestedId } }) => {
        cy.request("PUT", `/api/card/${nestedId}`, { enable_embedding: true });

        visitQuestion(nestedId);
      });
    });

    cy.icon("share").click();
    cy.findByText("Embed this question in an application").click();

    visitIframe();

    // Global (Data model) settings should be preserved
    cy.findByText("Product ID as Title");
    cy.findByText("Awesome Concrete Shoes");

    // Custom column
    cy.findByText("Math");

    // Base question visualization settings should reset to the defaults (inherit global formatting)
    cy.findByText("Total");
    cy.findByText("39.72");
    cy.findByText("February 11, 2019, 9:40 PM");

    cy.findAllByTestId("mini-bar").should("not.exist");

    // Data model: Subtotal is turned off globally
    cy.findByText("Subtotal").should("not.exist");
  });

  it("should display GUI question with explicit joins correctly", () => {
    cy.createQuestion(joinedQuestion).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      visitQuestion(id);
    });

    cy.icon("share").click();
    cy.findByText("Embed this question in an application").click();

    visitIframe();

    // Base question assertions
    cy.findByText("Product ID as Title");
    cy.findByText("Awesome Concrete Shoes");
    cy.findByText("Math");
    cy.findByText("Billed");
    cy.findByText("€39.72");
    cy.findByText("Mon, Feb 11, 2019, 21:40:27");
    cy.findAllByTestId("mini-bar");
    cy.findByText("Subtotal").should("not.exist");

    // Joined table fields
    cy.contains("98.52598640° W");

    cy.contains("User → Birth Date");
    cy.contains("December 12, 1986");

    cy.contains("October 7, 2017, 1:34 AM");
  });

  it("should display according to `locale` parameter metabase#22561", () => {
    const CARD_ID = 1;
    cy.request("PUT", `/api/card/${CARD_ID}`, { enable_embedding: true });

    visitQuestion(CARD_ID);

    cy.icon("share").click();
    cy.findByText("Embed this question in an application").click();

    visitIframe();

    cy.url().then(url => {
      cy.visit({
        url,
        qs: {
          locale: "de",
        },
      });
    });

    cy.findByText("Februar 11, 2019, 9:40 PM");
  });
});

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1).closest("td").siblings("td").findByText(val2);
}

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  cy.get(".x-axis-label").invoke("text").should("eq", xLabel);

  cy.get(".y-axis-label").invoke("text").should("eq", yLabel);
}
