import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

import { germanFieldNames } from "./constants";
import {
  interceptContentTranslationRoutes,
  uploadTranslationDictionary,
} from "./helpers/e2e-content-translation-helpers";
import { type CardDisplayType, cardDisplayTypes } from "metabase-types/api";
import { P, match } from "ts-pattern";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { PEOPLE_ID, PEOPLE, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

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

            const visitViz = (displayType: CardDisplayType) =>
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

            cardDisplayTypes.forEach((displayType: CardDisplayType) => {
              // We use ts-pattern's Match.exhaustive() method to ensure that
              // we cover each type of visualization in CardDisplayType
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
                .with("bar", () => {
                  visitViz(displayType);
                  columnsInChart.forEach((row) => {
                    cy.findByText(row.msgid).should("be.visible");
                    cy.findByText(row.msgstr).should("not.exist");
                  });
                  H.assertFirstEChartsTooltip(displayType, {
                    header: "Bewertung",
                  });
                })
                .with("line", () => {
                  visitViz(displayType);
                  columnsInChart.forEach((row) => {
                    cy.findByText(row.msgid).should("be.visible");
                    cy.findByText(row.msgstr).should("not.exist");
                  });
                  H.assertFirstEChartsTooltip(displayType, {
                    header: "Bewertung",
                  });
                })
                .with("row", () => {
                  visitViz(displayType);
                  columnsInChart.forEach((row) => {
                    cy.findByText(row.msgid).should("be.visible");
                    cy.findByText(row.msgstr).should("not.exist");
                  });
                  H.assertFirstEChartsTooltip(displayType, {
                    header: "Bewertung",
                  });
                })
                .with("area", () => {
                  visitViz(displayType);
                  columnsInChart.forEach((row) => {
                    cy.findByText(row.msgid).should("be.visible");
                    cy.findByText(row.msgstr).should("not.exist");
                  });
                  H.assertFirstEChartsTooltip(displayType, {
                    header: "Bewertung",
                  });
                })
                .with("combo", () => {
                  visitViz(displayType);
                  columnsInChart.forEach((row) => {
                    cy.findByText(row.msgid).should("be.visible");
                    cy.findByText(row.msgstr).should("not.exist");
                  });
                  H.assertFirstEChartsTooltip(displayType, {
                    header: "Bewertung",
                  });
                })
                .with("scatter", () => {
                  visitViz(displayType);
                  columnsInChart.forEach((row) => {
                    cy.findByText(row.msgid).should("be.visible");
                    cy.findByText(row.msgstr).should("not.exist");
                  });
                  H.assertFirstEChartsTooltip(displayType, {
                    header: "Bewertung",
                  });
                })
                .with("waterfall", () => {
                  visitViz(displayType);
                  columnsInChart.forEach((row) => {
                    cy.findByText(row.msgid).should("be.visible");
                    cy.findByText(row.msgstr).should("not.exist");
                  });
                  H.assertFirstEChartsTooltip(displayType, {
                    header: "Bewertung",
                  });
                })
                .with("funnel", () => {
                  visitViz(displayType);
                  columnsInChart.forEach((row) => {
                    cy.findByText(row.msgid).should("be.visible");
                    cy.findByText(row.msgstr).should("not.exist");
                  });
                  H.assertFirstEChartsTooltip(displayType, {
                    header: "Bewertung",
                  });
                })
                .with("pivot", () => {
                  visitViz(displayType);
                  columnsInChart.forEach((row) => {
                    cy.findByText(row.msgid).should("be.visible");
                    cy.findByText(row.msgstr).should("not.exist");
                  });
                  // No tooltip for pivot
                })
                .with("object", () => {
                  // TODO
                })
                .with(P.union("sankey"), () => {
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
                    /** These types of visualizations should show the names of both columns */
                    const displayTypesThatShowBothColumns = [
                      "bar",
                      "line",
                      "row",
                      "area",
                      "combo",
                      "pivot",
                      "funnel",
                      "detail",
                      "scatter",
                      "waterfall",
                    ];
                    if (displayTypesThatShowBothColumns.includes(displayType)) {
                      columnsInChart.forEach((row) => {
                        cy.findByText(row.msgid).should("be.visible");
                        cy.findByText(row.msgstr).should("not.exist");
                      });
                    }
                    const displayTypesWithTooltips: CardDisplayType[] = [
                      "bar",
                      "line",
                      "pie",
                      "row",
                      "area",
                      "funnel",
                      "combo",
                      "scatter",
                      "waterfall",
                      "map", // Map tooltips show all columns
                    ];

                    if (displayType === "bar") {
                      H.assertFirstEChartsTooltip(displayType, {
                        header: "Bewertung",
                      });
                    } else if (displayType === "line") {
                      columnsInChart.forEach((row) => {
                        cy.findByText(row.msgid).should("not.exist");
                        cy.findByText(row.msgstr).should("be.visible");
                      });
                      H.assertFirstEChartsTooltip(displayType, {
                        header: "Bewertung",
                      });
                    } else if (displayType === "row") {
                      columnsInChart.forEach((row) => {
                        cy.findByText(row.msgid).should("not.exist");
                        cy.findByText(row.msgstr).should("be.visible");
                      });
                      H.assertFirstEChartsTooltip(displayType, {
                        header: "Bewertung",
                      });
                    } else if (displayType === "area") {
                      columnsInChart.forEach((row) => {
                        cy.findByText(row.msgid).should("not.exist");
                        cy.findByText(row.msgstr).should("be.visible");
                      });
                      H.assertFirstEChartsTooltip(displayType, {
                        header: "Bewertung",
                      });
                    } else if (displayType === "combo") {
                      columnsInChart.forEach((row) => {
                        cy.findByText(row.msgid).should("not.exist");
                        cy.findByText(row.msgstr).should("be.visible");
                      });
                      H.assertFirstEChartsTooltip(displayType, {
                        header: "Bewertung",
                      });
                    } else if (displayType === "scatter") {
                      // TODO
                    } else if (displayType === "waterfall") {
                      // TODO
                    }
                  });
                })
                .with("map", () => {
                  H.visitQuestionAdhoc({
                    dataset_query: {
                      database: SAMPLE_DB_ID,
                      query: {
                        "source-table": PEOPLE_ID,
                        aggregation: [["count"]],
                        breakout: [["field", PEOPLE.STATE, null]],
                      },
                      type: "query",
                    },
                    display: "map",
                    visualization_settings: {
                      "map.type": "region",
                      "map.region": "us_states",
                    },
                  });
                  H.assertFirstEChartsTooltip("map", {
                    rows: [], // something here describing all the columns
                  });
                })
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
                    H.assertFirstEChartsTooltip("pie", {
                      header: "Kategorie",
                    });
                  });
                })
                .exhaustive();
            });
          });
          // - pie
        });
      });
    });
  });
});
