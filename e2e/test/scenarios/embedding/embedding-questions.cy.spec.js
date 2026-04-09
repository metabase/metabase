const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import {
  joinedQuestion,
  questionWithAggregation,
  regularQuestion,
} from "./shared/embedding-questions";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > embedding > questions", () => {
  beforeEach(() => {
    H.restore();
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

  it("should display a dashboard question correctly", () => {
    H.createQuestion(
      {
        name: "Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        database_id: SAMPLE_DATABASE.id,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
        enable_embedding: true,
      },
      { visitQuestion: true, wrapId: true },
    );

    cy.get("@questionId").then((questionId) => {
      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: questionId,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });
    });

    H.visitIframe();

    cy.url().should("include", "embed");

    cy.findByTestId("embed-frame").within(() => {
      cy.findByText("Total Orders");
      cy.findByText("18,760");
    });
  });

  it("should display the regular GUI question correctly", () => {
    const { name: title, description } = regularQuestion;

    H.createQuestion(regularQuestion).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      H.visitQuestion(id);
      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: id,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });
    });

    H.visitIframe();

    cy.findByTestId("embed-frame").within(() => {
      cy.findByText(title);

      cy.icon("info").realHover();
    });

    H.tooltip().contains(description);

    cy.findByTestId("embed-frame").within(() => {
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
      cy.findByText("Tue, Feb 11, 2025, 21:40:27");
      // Question settings: Show mini-bar
      cy.findAllByTestId("mini-bar-container");

      // Data model: Subtotal is turned off globally
      cy.findByText("Subtotal").should("not.exist");
    });
  });

  it("should display the GUI question with aggregation correctly", () => {
    H.createQuestion(questionWithAggregation).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      H.visitQuestion(id);

      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: id,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });
    });

    H.visitIframe();

    assertOnXYAxisLabels({ xLabel: "Created At", yLabel: "Count" });

    H.echartsContainer()
      .findAllByText(/2022/)
      .should("have.length", 5)
      .and("contain", "Apr 2022");

    H.echartsContainer().should("contain", "60");

    // Check the tooltip for the last point on the line
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.cartesianChartCircle().last().trigger("mousemove");

    H.assertEChartsTooltip({
      header: "Aug 2022",
      rows: [{ name: "2", value: "79" }],
    });
  });

  it("should display the nested GUI question correctly", () => {
    H.createQuestion(regularQuestion).then(({ body: { id } }) => {
      const nestedQuestion = {
        query: { "source-table": `card__${id}`, limit: 10 },
      };

      H.createQuestion(nestedQuestion).then(({ body: { id: nestedId } }) => {
        cy.request("PUT", `/api/card/${nestedId}`, { enable_embedding: true });

        H.visitQuestion(nestedId);

        H.openLegacyStaticEmbeddingModal({
          resource: "question",
          resourceId: nestedId,
          activeTab: "parameters",
          unpublishBeforeOpen: false,
        });
      });
    });

    H.visitIframe();

    // Global (Data model) settings should be preserved
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID as Title");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Awesome Concrete Shoes");

    // Custom column
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Math");

    // Base question visualization settings should reset to the defaults (inherit global formatting)
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Total");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("39.72");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("February 11, 2025, 9:40 PM");

    cy.findAllByTestId("mini-bar-container").should("not.exist");

    // Data model: Subtotal is turned off globally
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Subtotal").should("not.exist");
  });

  it("should display GUI question with explicit joins correctly", () => {
    H.createQuestion(joinedQuestion).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      H.visitQuestion(id);

      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: id,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });
    });

    H.visitIframe();

    // Base question assertions
    cy.findByTestId("visualization-root")
      .should("contain", "Product ID as Title")
      .should("contain", "Awesome Concrete Shoes")
      .should("contain", "Math")
      .should("contain", "Billed")
      .should("contain", "€39.72")
      .should("contain", "Tue, Feb 11, 2025, 21:40:27")
      .should("not.contain", "Subtotal");

    cy.findAllByTestId("mini-bar-container").should("have.length", 5);
    H.tableInteractiveScrollContainer().scrollTo("right");

    // Joined table fields
    cy.findByTestId("visualization-root")
      .should("contain", "98.52598640° W")
      .should("contain", "User → Birth Date")
      .should("contain", "December 12, 1986")
      .should("contain", "October 7, 2023, 1:34 AM");
  });
});

describe("scenarios [EE] > embedding > questions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

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

  it("should display according to `#locale` hash parameter (metabase#22561, metabase#50182)", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      enable_embedding: true,
    });

    // We don't have a de-CH.json file, so it should fallback to de.json, see metabase#51039 for more details
    cy.intercept("/app/locales/de.json").as("deLocale");

    H.visitEmbeddedPage(
      {
        resource: { question: ORDERS_QUESTION_ID },
        params: {},
      },
      {
        additionalHashOptions: {
          locale: "de-CH",
        },
      },
    );

    cy.wait("@deLocale");

    H.main().findByText("Februar 11, 2025, 9:40 PM").realHover();
    cy.findByRole("button", { name: "Ergebnis downloaden" }).should("exist");
    cy.url().should("include", "locale=de");
  });

  it("should display according to `#font` hash parameter (metabase#45638)", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      enable_embedding: true,
    });

    H.visitEmbeddedPage(
      {
        resource: { question: ORDERS_QUESTION_ID },
        params: {},
      },
      {
        additionalHashOptions: {
          font: "Roboto",
        },
      },
    );

    H.main().should("have.css", "font-family", "Roboto, sans-serif");
  });
});

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  H.echartsContainer().get("text").contains(xLabel);

  H.echartsContainer().get("text").contains(yLabel);
}

describe("scenarios > embedding > questions > downloads", () => {
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

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails, {
      wrapId: true,
    });
  });

  context("without token", () => {
    it("should not be possible to disable downloads", () => {
      cy.get("@questionId").then((questionId) => {
        H.visitQuestion(questionId);

        H.openLegacyStaticEmbeddingModal({
          resource: "question",
          resourceId: questionId,
          activeTab: "lookAndFeel",
        });

        cy.log(
          "Embedding settings page should not show option to disable downloads",
        );
        cy.findByLabelText("Customizing look and feel").should(
          "not.contain",
          "Download (csv, xlsx, json, png)",
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
        H.visitEmbeddedPage(payload, {
          setFilters: { text: "Foo" },
        });

        cy.findByRole("gridcell").should("have.text", "Foo");
        H.main().realHover();
        cy.findByRole("button", { name: "Download results" }).click();

        H.popover().within(() => {
          cy.findByText("Download");
          cy.findByText(".csv");
          cy.findByText(".xlsx");
          cy.findByText(".json");
        });

        cy.log(
          "Trying to prevent downloads via query params doesn't have any effect",
        );
        cy.url().then((url) => {
          cy.visit(url + "&downloads=false");
        });

        cy.findByRole("gridcell").should("have.text", "Foo");
        H.main().realHover();
        cy.findByRole("button", { name: "Download results" }).should("exist");
      });
    });
  });

  context("premium token with paid features", () => {
    beforeEach(() => H.activateToken("pro-self-hosted"));

    it("should be possible to disable downloads", () => {
      cy.get("@questionId").then((questionId) => {
        H.visitQuestion(questionId);

        H.openLegacyStaticEmbeddingModal({
          resource: "question",
          resourceId: questionId,
          activeTab: "lookAndFeel",
        });

        cy.log("Disable downloads");
        cy.findByLabelText("Download (csv, xlsx, json, png)")
          .as("allow-download-toggle")
          .should("be.checked");

        cy.findByText("Download (csv, xlsx, json, png)").click();
        cy.get("@allow-download-toggle").should("not.be.checked");

        cy.log('Use API to "publish" this question and to enable its filter');
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            text: "enabled",
          },
        });

        H.visitIframe();

        H.filterWidget().type("Foo{enter}");
        cy.findByRole("gridcell").should("have.text", "Foo");

        cy.location("search").should("eq", "?text=Foo");
        cy.location("hash").should("match", /&downloads=false$/);

        cy.log("We don't even show the footer if it's empty");
        cy.findByRole("contentinfo").should("not.exist");
        cy.icon("download").should("not.exist");
      });
    });
  });
});
