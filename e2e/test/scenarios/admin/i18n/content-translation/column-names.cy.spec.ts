import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

import { germanFieldNames } from "./constants";
import {
  interceptContentTranslationRoutes,
  uploadTranslationDictionary,
} from "./helpers/e2e-content-translation-helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { type CardDisplayType, cardDisplayTypes } from "metabase-types/api";
import { P, match } from "ts-pattern";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

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

            const visitViz = (displayType: CardDisplayType) => {
              cy.signInAsAdmin();
              H.createQuestion({
                name: `${displayType} visualization`,
                display: displayType,
                query: {
                  "source-table": PRODUCTS_ID,
                },
                visualization_settings: {
                  "graph.dimensions": [columnX],
                  "graph.metrics": [columnY],
                },
                // TODO: So the visualization has fewer data points, let's
                // restrict the range somehow
              }).then(({ body: { id } }) => {
                cy.request("PUT", `/api/card/${id}`, {
                  enable_embedding: true,
                });
                H.visitQuestion(id);
                H.openStaticEmbeddingModal({
                  acceptTerms: false,
                  activeTab: "parameters",
                });
                H.getIframeUrl().then((iframeUrl) => {
                  cy.signOut();
                  const [urlBeforeHash, urlHash] = iframeUrl.split("#");
                  const separator = urlHash === undefined ? "#" : "&";
                  cy.visit(`${urlBeforeHash}${separator}locale=de`);
                });
              });
            };

            const assertColumnNamesAreTranslated = () =>
              columnsInChart.forEach((row) => {
                H.echartsContainer()
                  .get("text")
                  .should("contain", row.msgstr)
                  .should("not.contain", row.msgid);
              });

            const columnsInChart = germanFieldNames.filter((row) =>
              [columnX, columnY].includes(row.msgid),
            );

            cardDisplayTypes.forEach((displayType: CardDisplayType) => {
              // We use ts-pattern's Match.exhaustive() method to ensure that
              // we cover each type of visualization in CardDisplayType
              match(displayType)
                .with(
                  P.union(
                    "table", // TODO: I'm not sure why table is in this list
                    "scalar",
                    "smartscalar",
                    "gauge",
                    "progress",
                    "sankey",
                  ),
                  () => {
                    // Do nothing. These visualizations don't show column names
                  },
                )
                .with("bar", () => {
                  it.only(displayType, () => {
                    visitViz(displayType);
                    assertColumnNamesAreTranslated();
                    // H.assertFirstEChartsTooltip(displayType, {
                    //   header: "Bewertung",
                    // });
                  });
                })
                .with("line", () => {
                  it(displayType, () => {
                    visitViz(displayType);
                    assertColumnNamesAreTranslated();
                    H.assertFirstEChartsTooltip(displayType, {
                      header: "Bewertung",
                    });
                  });
                })
                .with("row", () => {
                  it(displayType, () => {
                    visitViz(displayType);
                    assertColumnNamesAreTranslated();
                    H.assertFirstEChartsTooltip(displayType, {
                      header: "Bewertung",
                    });
                  });
                })
                .with("area", () => {
                  it(displayType, () => {
                    visitViz(displayType);
                    assertColumnNamesAreTranslated();
                    H.assertFirstEChartsTooltip(displayType, {
                      header: "Bewertung",
                    });
                  });
                })
                .with("combo", () => {
                  it(displayType, () => {
                    visitViz(displayType);
                    assertColumnNamesAreTranslated();
                    H.assertFirstEChartsTooltip(displayType, {
                      header: "Bewertung",
                    });
                  });
                })
                .with("scatter", () => {
                  it(displayType, () => {
                    visitViz(displayType);
                    assertColumnNamesAreTranslated();
                    H.assertFirstEChartsTooltip(displayType, {
                      header: "Bewertung",
                    });
                  });
                })
                .with("waterfall", () => {
                  it(displayType, () => {
                    visitViz(displayType);
                    assertColumnNamesAreTranslated();
                    H.assertFirstEChartsTooltip(displayType, {
                      header: "Bewertung",
                    });
                  });
                })
                .with("funnel", () => {
                  it(displayType, () => {
                    visitViz(displayType);
                    assertColumnNamesAreTranslated();
                    H.assertFirstEChartsTooltip(displayType, {
                      header: "Bewertung",
                    });
                  });
                })
                .with("pivot", () => {
                  it(displayType, () => {
                    visitViz(displayType);
                    assertColumnNamesAreTranslated();
                    // No tooltip for pivot table visualization
                  });
                })
                .with("object", () => {
                  // TODO
                })
                .with("map", () => {
                  it(displayType, () => {
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
                  });
                })
                .with("pie", () => {
                  it(`of type: ${displayType}`, () => {
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
                .with(
                  P.union(
                    "pivot",
                    "funnel",
                    "object",
                    "map",
                    "sankey",
                    "waterfall",
                  ),
                  () => {
                    // not implemented yet
                  },
                )
                .exhaustive();
            });
          });
          // - pie
        });
      });
    });
  });
});
