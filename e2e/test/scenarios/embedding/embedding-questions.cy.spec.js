import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visitQuestion,
  popover,
  visitIframe,
  openStaticEmbeddingModal,
  echartsContainer,
  cartesianChartCircle,
  testPairedTooltipValues,
  describeEE,
  filterWidget,
  visitEmbeddedPage,
  setTokenFeatures,
} from "e2e/support/helpers";

import {
  regularQuestion,
  questionWithAggregation,
  joinedQuestion,
} from "./shared/embedding-questions";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > embedding > questions", () => {
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

    openStaticEmbeddingModal({ activeTab: "parameters" });

    visitIframe();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(title);

    cy.icon("info").realHover();
    popover().contains(description);

    // Data model: Renamed column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID as Title");
    // Data model: Display value changed to show FK
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Awesome Concrete Shoes");
    // Custom column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Math");
    // Question settings: Renamed column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Billed");
    // Question settings: Column formating
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("€39.72");
    // Question settings: Abbreviated date, day enabled, 24H clock with seconds
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tue, Feb 11, 2025, 21:40:27");
    // Question settings: Show mini-bar
    cy.findAllByTestId("mini-bar");

    // Data model: Subtotal is turned off globally
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Subtotal").should("not.exist");
  });

  it("should display the GUI question with aggregation correctly", () => {
    cy.createQuestion(questionWithAggregation).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      visitQuestion(id);
    });

    openStaticEmbeddingModal({ activeTab: "parameters" });

    visitIframe();

    assertOnXYAxisLabels({ xLabel: "Created At", yLabel: "Count" });

    echartsContainer()
      .findAllByText(/2022/)
      .should("have.length", 5)
      .and("contain", "Apr 2022");

    echartsContainer().should("contain", "60");

    // Check the tooltip for the last point on the line
    cartesianChartCircle().last().realHover();

    popover().within(() => {
      testPairedTooltipValues("Created At", "Aug 2022");
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

    openStaticEmbeddingModal({ activeTab: "parameters" });

    visitIframe();

    // Global (Data model) settings should be preserved
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID as Title");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Awesome Concrete Shoes");

    // Custom column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Math");

    // Base question visualization settings should reset to the defaults (inherit global formatting)
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Total");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("39.72");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("February 11, 2025, 9:40 PM");

    cy.findAllByTestId("mini-bar").should("not.exist");

    // Data model: Subtotal is turned off globally
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Subtotal").should("not.exist");
  });

  it("should display GUI question with explicit joins correctly", () => {
    cy.createQuestion(joinedQuestion).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      visitQuestion(id);
    });

    openStaticEmbeddingModal({ activeTab: "parameters" });

    visitIframe();

    // Base question assertions
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID as Title");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Awesome Concrete Shoes");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Math");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Billed");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("€39.72");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tue, Feb 11, 2025, 21:40:27");
    cy.findAllByTestId("mini-bar");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Subtotal").should("not.exist");

    // Joined table fields
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("98.52598640° W");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("User → Birth Date");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("December 12, 1986");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("October 7, 2023, 1:34 AM");
  });

  it("should display according to `locale` parameter metabase#22561", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      enable_embedding: true,
    });

    visitQuestion(ORDERS_QUESTION_ID);

    openStaticEmbeddingModal({ activeTab: "parameters" });

    visitIframe();

    cy.url().then(url => {
      cy.visit({
        url,
        qs: {
          locale: "de",
        },
      });
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Februar 11, 2025, 9:40 PM");
  });
});

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  echartsContainer().get("text").contains(xLabel);

  echartsContainer().get("text").contains(yLabel);
}

describeEE("scenarios > embedding > questions > downloads", () => {
  const questionDetails = {
    name: "Simple SQL Query for Embedding",
    native: {
      query: "select {{text}} as WYSIWYG",
      "template-tags": {
        text: {
          id: "fake-uuid",
          name: "text",
          "display-name": "Text",
          type: "text",
          default: null,
        },
      },
    },
  };
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("publishChanges");
    cy.intercept("GET", "/api/embed/card/**/query").as("dl");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, {
      wrapId: true,
    });
  });

  context("without token", () => {
    it("should not be possible to disable downloads", () => {
      cy.get("@questionId").then(questionId => {
        visitQuestion(questionId);

        openStaticEmbeddingModal({ activeTab: "lookAndFeel" });

        cy.log(
          "Embedding settings page should not show option to disable downloads",
        );
        cy.findByLabelText("Customizing look and feel").should(
          "not.contain",
          "Download buttons",
        );

        cy.log('Use API to "publish" this question and to enable its filter');
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            text: "enabled",
          },
        });

        const payload = {
          resource: { question: questionId },
          params: {},
        };

        cy.log(
          "Visit embedded question and set its filter through query parameters",
        );
        visitEmbeddedPage(payload, {
          setFilters: { text: "Foo" },
        });

        cy.get("[data-testid=cell-data]").should("have.text", "Foo");
        cy.findByRole("contentinfo").icon("download").click();

        popover().within(() => {
          cy.findByText("Download full results");
          cy.findByText(".csv");
          cy.findByText(".xlsx");
          cy.findByText(".json");
        });

        cy.log(
          "Trying to prevent downloads via query params doesn't have any effect",
        );
        cy.url().then(url => {
          cy.visit(url + "&downloads=false");
        });

        cy.get("[data-testid=cell-data]").should("have.text", "Foo");
        cy.findByRole("contentinfo").icon("download");
      });
    });
  });

  context("premium token with paid features", () => {
    beforeEach(() => setTokenFeatures("all"));

    it("should be possible to disable downloads", () => {
      cy.get("@questionId").then(questionId => {
        visitQuestion(questionId);

        openStaticEmbeddingModal({
          activeTab: "lookAndFeel",
          acceptTerms: false,
        });

        cy.log("Disable downloads");
        cy.findByLabelText("Download buttons")
          .as("allow-download-toggle")
          .should("be.checked");

        cy.findByText("Download buttons").click();
        cy.get("@allow-download-toggle").should("not.be.checked");

        cy.log('Use API to "publish" this question and to enable its filter');
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            text: "enabled",
          },
        });

        visitIframe();

        filterWidget().type("Foo{enter}");
        cy.get("[data-testid=cell-data]").should("have.text", "Foo");

        cy.location("search").should("eq", "?text=Foo");
        cy.location("hash").should("match", /&downloads=false$/);

        cy.log("We don't even show the footer if it's empty");
        cy.findByRole("contentinfo").should("not.exist");
        cy.icon("download").should("not.exist");
      });
    });
  });
});
