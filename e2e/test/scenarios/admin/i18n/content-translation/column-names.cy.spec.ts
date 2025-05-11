import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

import { germanFieldNames } from "./constants";
import {
  interceptContentTranslationRoutes,
  uploadTranslationDictionary,
} from "./helpers/e2e-content-translation-helpers";
import { type CardDisplayType, cardDisplayTypes } from "metabase-types/api";
import { P, match } from "ts-pattern";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const { H } = cy;

describe("scenarios > admin > localization > content translation of column names", () => {
  describe("ee", () => {
    describe("after uploading related German translations", () => {
      beforeEach(() => {
        interceptContentTranslationRoutes();
      });

      before(() => {
        H.restore();
        cy.signInAsAdmin();
        H.setTokenFeatures("all");

        H.createQuestion(
          {
            name: "Products question",
            query: {
              "source-table": PRODUCTS_ID,
            },
          },
          { wrapId: true, idAlias: "productsQuestionId" },
        );
        uploadTranslationDictionary(germanFieldNames);
        H.snapshot("translations-uploaded--normal-user-locale-is-en");
        cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, {
          locale: "de",
        });
        H.snapshot("translations-uploaded--normal-user-locale-is-de");
      });

      describe("on the question page", () => {
        let productsQuestionId = null as unknown as number;

        before(() => {
          cy.get<number>("@productsQuestionId").then((id) => {
            productsQuestionId = id;
          });
        });

        describe("when locale is English, column names are NOT localized in", () => {
          beforeEach(() => {
            H.restore("translations-uploaded--normal-user-locale-is-en" as any);
            cy.signInAsNormalUser();
          });

          it.only("column headers", () => {
            H.visitQuestion(productsQuestionId);
            cy.findByTestId("table-header").within(() => {
              germanFieldNames.forEach((row) => {
                cy.findByText(row.msgid).should("be.visible");
                cy.findByText(row.msgstr).should("not.exist");
              });
            });
          });
        });

        describe("when locale is German, column names ARE localized in", () => {
          beforeEach(() => {
            H.restore("translations-uploaded--normal-user-locale-is-de" as any);
            cy.signInAsNormalUser();
          });

          it("column headers", () => {
            H.visitQuestion(productsQuestionId);
            cy.findByTestId("table-header").within(() => {
              germanFieldNames.forEach((row) => {
                cy.findByText(row.msgid).should("not.exist");
                cy.findByText(row.msgstr).should("be.visible");
              });
            });
          });

          describe.only("column headers in viz", () => {
            const columnX = "PRICE";
            const columnY = "RATING";
            // NOTE: What about the 'trend' visualization? This is an option in
            // the app, but it's not in the cardDisplayTypes array

            cardDisplayTypes.forEach((displayType: CardDisplayType) => {
              match(displayType)
                .with(
                  P.union(
                    "table",
                    "scalar",
                    "smartscalar",
                    "gauge",
                    "progress",
                  ),
                  () => {
                    // Do nothing. These visualizations don't show column names
                  },
                )
                .with(
                  P.union(
                    "bar",
                    "line",
                    "row",
                    "area",
                    "combo",
                    "scatter",
                    "waterfall",
                  ),
                  () => {
                    it(`of type: ${displayType}`, () => {
                      H.createQuestion(
                        {
                          name: `${displayType} visualization`,
                          display: displayType,
                          query: {
                            "source-table": PRODUCTS_ID,
                          },
                          visualization_settings: {
                            "graph.dimensions": [columnX],
                            "graph.metrics": [columnY],
                          },
                        },
                        { visitQuestion: true },
                      );

                      const columnsInChart = germanFieldNames.filter((row) =>
                        [columnX, columnY].includes(row.msgid),
                      );
                      columnsInChart.forEach((row) => {
                        cy.findByText(row.msgid).should("not.exist");
                        cy.findByText(row.msgstr).should("be.visible");
                      });
                      if (displayType === "bar") {
                        H.chartPathWithFillColor("#88BF4D").first().realHover();
                        H.assertEChartsTooltip({
                          header: "Bewertung", // 'Rating' in German
                          rows: undefined,
                          footer: undefined,
                          blurAfter: false,
                        });
                      } else if (displayType === "line") {
                        H.cartesianChartCircleWithColor("#509EE3")
                          .eq(3)
                          .realHover();
                        H.assertEChartsTooltip({
                          header: "Bewertung", // 'Rating' in German
                          rows: undefined,
                          footer: undefined,
                          blurAfter: false,
                        });
                      } else if (displayType === "row") {
                        // TODO
                      } else if (displayType === "area") {
                        // TODO
                      } else if (displayType === "combo") {
                        // TODO
                      } else if (displayType === "scatter") {
                        // TODO
                      } else if (displayType === "waterfall") {
                        // TODO
                      }
                    });
                  },
                )
                .with("pie", () => {
                  it.only(`of type: ${displayType}`, () => {
                    H.createQuestion(
                      {
                        display: "pie",
                        query: {
                          "source-table": PRODUCTS_ID,
                          aggregation: [["count"]],
                          breakout: [["field", PRODUCTS.CATEGORY, null]],
                        },
                      },
                      { visitQuestion: true },
                    );

                    H.pieSliceWithColor("#88BF4D").first().trigger("mousemove");
                    H.assertEChartsTooltip({
                      header: "Kategorie",
                      rows: undefined,
                      footer: undefined,
                      blurAfter: false,
                    });
                  });
                })
                .with(
                  P.union(
                    "funnel",
                    "pivot",
                    "object",
                    "map", // Here we just need to test the ECharts tooltip
                    "sankey",
                  ),
                  () => {
                    // not implemented yet
                  },
                )
                .exhaustive();
            });
          });
          // TODO: Need to update tooltip too
          // doesn't work yet in this test:
          // - pie
          // - pivot
          // - funnel
          // - object
          // - map
          // - sankey
          //
          // shows column names in tooltips:
          // - pie
        });
      });
    });
  });
});
