import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import { type CardDisplayType, cardDisplayTypes } from "metabase-types/api";

import { germanFieldNames } from "./constants";
import {
  interceptContentTranslationRoutes,
  uploadTranslationDictionary,
} from "./helpers/e2e-content-translation-helpers";
const { PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

describe("scenarios > admin > localization > content translation of column names in static-embedded visualizations", () => {
  describe("ee", () => {
    before(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setTokenFeatures("all");

      uploadTranslationDictionary(germanFieldNames);
      H.snapshot("translations-uploaded");
    });

    beforeEach(() => {
      interceptContentTranslationRoutes();
      H.restore("translations-uploaded" as any);
    });

    const columnX = "PRICE";
    const columnY = "RATING";

    const priceVsRating: Pick<
      StructuredQuestionDetails,
      "query" | "visualization_settings"
    > = {
      query: {
        "source-table": PRODUCTS_ID,
        filter: [
          "and",
          ["between", ["field", PRODUCTS.PRICE, null], 40, 60],
          ["between", ["field", PRODUCTS.RATING, null], 3.7, 4],
        ],
      },
      visualization_settings: {
        "graph.dimensions": [columnX],
        "graph.metrics": [columnY],
      },
    };

    const priceVsAverageRating: Pick<
      StructuredQuestionDetails,
      "query" | "visualization_settings"
    > = {
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
        breakout: [["field", PRODUCTS.RATING, null]],
      },
      visualization_settings: {
        "graph.dimensions": ["PRICE"],
        "graph.metrics": ["RATING"],
        "graph.y_axis.title_text": "Average Price",
      },
    };

    const visitEmbeddedViz = (questionDetails: StructuredQuestionDetails) => {
      cy.signInAsAdmin();
      H.createQuestion(
        {
          name: questionDetails.display,
          ...questionDetails,
          enable_embedding: true,
        },
        { wrapId: true },
      );
      cy.get<number>("@questionId").then((questionId) => {
        H.visitEmbeddedPage(
          {
            resource: { question: questionId },
            params: {},
          },
          {
            additionalHashOptions: {
              locale: "de",
            },
          },
        );
      });
    };

    const assertColumnNamesAreTranslated = () =>
      columnsInChart.forEach((row) => {
        cy.findByTestId("visualization-root")
          .get("text")
          .should("contain", row.msgstr)
          .should("not.contain", row.msgid);
      });

    const columnsInChart = germanFieldNames.filter((row) =>
      [columnX, columnY].includes(row.msgid),
    );

    /** To ensure that all display types are handled, each test pushes a
     * display type to this array. At the end, we make sure that this array
     * includes all the display types in the CardDisplayType type.

      We initialize it with a few display types that do not have localizable
      column names. */
    const tested: CardDisplayType[] = [
      "scalar",
      "smartscalar",
      "gauge",
      "progress",

      // The names in a sankey query come from the SQL and are not
      // currently localizable
      "sankey",

      // This isn't a graphical visualization so it's not tested here
      "table",
    ];

    it("bar", () => {
      visitEmbeddedViz({
        ...priceVsAverageRating,
        display: "bar",
      });
      assertColumnNamesAreTranslated();
      H.chartPathWithFillColor("#A989C5").eq(3).trigger("mousemove");
      cy.findByRole("tooltip").findByText(/Durchschnittspreis/);
      tested.push("bar");
    });

    it("line", () => {
      visitEmbeddedViz({
        ...priceVsAverageRating,
        display: "line",
      });
      assertColumnNamesAreTranslated();
      H.cartesianChartCircle().eq(3).trigger("mousemove", { force: true });
      cy.findByRole("tooltip").findByText(/Durchschnittspreis/);
      tested.push("line");
    });

    it("pie", () => {
      visitEmbeddedViz({
        ...priceVsAverageRating,
        display: "pie",
      });
      H.pieSliceWithColor("#88BF4D").first().realHover();
      cy.findByRole("tooltip").findByText(/Bewertung/);
      tested.push("pie");
    });

    it("row", () => {
      visitEmbeddedViz({
        ...priceVsRating,
        display: "row",
      });
      assertColumnNamesAreTranslated();
      cy.findByTestId("visualization-root").findAllByText(/50/);
      cy.findByTestId("visualization-root")
        .findAllByRole("graphics-symbol")
        .eq(3)
        .realHover();
      cy.findByRole("tooltip").findByText(/Bewertung/);
      tested.push("row");
    });

    it("area", () => {
      visitEmbeddedViz({
        ...priceVsAverageRating,
        display: "area",
      });
      assertColumnNamesAreTranslated();
      H.cartesianChartCircle().eq(3).realHover();
      cy.findByRole("tooltip").findByText(/Durchschnittspreis/);
      tested.push("area");
    });

    it("combo", () => {
      visitEmbeddedViz({
        ...priceVsAverageRating,
        display: "combo",
      });
      assertColumnNamesAreTranslated();
      H.cartesianChartCircle().eq(3).realHover();
      cy.findByRole("tooltip").findByText(/Durchschnittspreis/);
      tested.push("combo");
    });

    it("pivot", () => {
      visitEmbeddedViz({
        ...priceVsAverageRating,
        display: "pivot",
      });
      assertColumnNamesAreTranslated();
      tested.push("pivot");
    });

    it("funnel", () => {
      visitEmbeddedViz({
        display: "funnel",
        ...priceVsAverageRating,
      });
      columnsInChart.forEach((row) => {
        cy.findByTestId("visualization-root")
          .should("contain", row.msgstr)
          .should("not.contain", row.msgid);
      });
      cy.findByTestId("visualization-root")
        .find("polygon[fill]")
        .first()
        .realHover();
      tested.push("funnel");
    });

    it("scatter", () => {
      visitEmbeddedViz({
        display: "scatter",
        ...priceVsRating,
      });
      assertColumnNamesAreTranslated();
      H.chartPathWithFillColor("#EF8C8C")
        .first()
        .trigger("mousemove", { force: true });
      cy.findByRole("tooltip").findByText(/Bewertung/);
      tested.push("scatter");
    });

    it("waterfall", () => {
      visitEmbeddedViz({
        display: "waterfall",
        ...priceVsAverageRating,
      });
      assertColumnNamesAreTranslated();
      cy.findByTestId("visualization-root")
        .find('path[fill="#4C5773"]')
        .first()
        .trigger("mousemove", { force: true });
      cy.findByRole("tooltip").findByText(/Durchschnittspreis/);
      tested.push("waterfall");
    });

    it("map", () => {
      cy.intercept("/app/assets/geojson/**").as("geojson");
      visitEmbeddedViz({
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.STATE, null]],
        },
        display: "map",
        visualization_settings: {
          "map.type": "region",
          "map.region": "us_states",
        },
      });
      cy.wait("@geojson");

      cy.get(".CardVisualization svg path").eq(22).as("texas");
      cy.get("@texas").should("be.visible");
      cy.get("@texas").trigger("mousemove");

      H.tooltip().within(() => {
        cy.findByText("Staat:").should("be.visible");
      });
      tested.push("map");
    });

    it("object", () => {
      visitEmbeddedViz({
        display: "object",
        ...priceVsRating,
      });
      assertColumnNamesAreTranslated();
      tested.push("object");
    });

    after(() => {
      // This check ensures that when we add another display type, we
      // remember to add a test for it here
      //
      // NOTE: When using it.only, disable this check
      const missing = cardDisplayTypes.filter((type) => !tested.includes(type));
      if (missing.length > 0) {
        throw new Error(`Untested display types: ${missing.join(", ")}`);
      }
    });
  });
});
