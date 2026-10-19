const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import {
  joinedQuestion,
  questionAsPinMapWithTiles,
  questionWithAggregation,
  regularQuestion,
} from "./shared/embedding-questions";

const { ORDERS, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

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
      cy.findByText("Fri, Feb 11, 2028, 21:40:27");
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
      .findAllByText(/2025/)
      .should("have.length", 5)
      .and("contain", "Apr 2025");

    H.echartsContainer().should("contain", "60");

    // Check the tooltip for the last point on the line
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.cartesianChartCircle().last().trigger("mousemove");

    H.assertEChartsTooltip({
      header: "Aug 2025",
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
    cy.findByText("February 11, 2028, 9:40 PM");

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
      .should("contain", "Fri, Feb 11, 2028, 21:40:27")
      .should("not.contain", "Subtotal");

    cy.findAllByTestId("mini-bar-container").should("have.length", 5);
    H.tableInteractiveScrollContainer().scrollTo("right");

    // Joined table fields
    cy.findByTestId("visualization-root")
      .should("contain", "98.52598640° W")
      .should("contain", "User → Birth Date")
      .should("contain", "December 12, 1986")
      .should("contain", "October 7, 2026, 1:34 AM");
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

  it("should display according to `#locale` and `#font` hash parameters (metabase#22561, metabase#50182, metabase#45638)", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      enable_embedding: true,
    });

    // We don't have a de-CH.json file, so it should fallback to de.json, see metabase#51039 for more details
    cy.intercept("GET", "**/locale-de-json*.js").as("deLocale");

    H.visitEmbeddedPage(
      {
        resource: { question: ORDERS_QUESTION_ID },
        params: {},
      },
      {
        additionalHashOptions: {
          locale: "de-CH",
          font: "Roboto",
        },
      },
    );

    cy.wait("@deLocale");

    H.main().findByText("Februar 11, 2028, 9:40 PM").realHover();
    cy.findByRole("button", { name: "Ergebnis downloaden" }).should("exist");
    cy.url().should("include", "locale=de");

    H.main().should(
      "have.css",
      "font-family",
      'Roboto, "Noto Sans", sans-serif',
    );
  });
});

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  H.echartsContainer().get("text").contains(xLabel);

  H.echartsContainer().get("text").contains(yLabel);
}

describe("issue 30535", () => {
  const questionDetails = {
    name: "3035",
    query: {
      "source-table": PRODUCTS_ID,
      limit: 10,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.sandboxTable({
      table_id: PRODUCTS_ID,
      attribute_remappings: {
        attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    });

    H.createQuestion(questionDetails).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      H.visitQuestion(id);

      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: id,
        activeTab: "parameters",
        previewMode: "preview",
        unpublishBeforeOpen: false,
      });
    });
  });

  it("user session should not apply sandboxing to a signed embedded question (metabase#30535)", () => {
    cy.document().then((doc) => {
      const iframe = doc.querySelector("iframe");

      cy.signOut();
      cy.signInAsSandboxedUser();

      cy.visit(iframe.src);
    });

    cy.findByRole("grid").within(() => {
      // The sandboxed user has an attribute cat="Widget"
      cy.findAllByText("Widget");
      // Sandboxing shouldn't affect results so we should see other product categories as well
      cy.findAllByText("Gizmo");
    });
  });
});

describe("issue 63687", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should properly display pin map tiles without auth errors for a valid JWT token", () => {
    H.createNativeQuestion(questionAsPinMapWithTiles, {
      visitQuestion: true,
      wrapId: true,
    });

    cy.get("@questionId").then((questionId) => {
      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: questionId,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });
    });

    cy.intercept("/api/embed/tiles/**").as("getTiles");

    H.visitIframe();

    cy.wait("@getTiles").then(({ response: tileResponse }) => {
      expect(tileResponse?.statusCode).to.equal(200);
    });
  });
});
