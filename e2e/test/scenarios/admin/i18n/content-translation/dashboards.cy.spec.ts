import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  NORMAL_USER_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  DashboardDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import { uploadTranslationDictionaryViaAPI } from "e2e/support/helpers/e2e-content-translation-helpers";
import {
  ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
} from "e2e/support/test-visualizer-data";
import type { DictionaryArray } from "metabase-types/api";
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const { ACCOUNTS_ID, ACCOUNTS, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;
import {
  frenchBooleanTranslations,
  frenchNames,
  germanFieldNames,
  germanFieldValues,
} from "./constants";

const { H } = cy;

describe("scenarios > content translation > static embeds > dashboards", () => {
  describe("pivot table renamed column (metabase#63296)", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      uploadTranslationDictionaryViaAPI([
        { locale: "fr", msgid: "Category", msgstr: "La catégorie" },
        { locale: "fr", msgid: "Title", msgstr: "Le titre" },
      ]);

      cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");

      cy.signInAsAdmin();

      H.createQuestion(ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY, {
        idAlias: "productsCountByCreatedAtQuestionId",
        wrapId: true,
      });

      H.createQuestion({
        name: "Pivot table",
        display: "pivot",
        query: {
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, null],
            ["field", PRODUCTS.TITLE, null],
          ],
          "source-table": PRODUCTS_ID,
        },
        visualization_settings: {
          "pivot_table.column_split": {
            rows: ["CATEGORY", "TITLE"],
            columns: [],
            values: ["count"],
          },
          column_settings: {
            '["name", "CATEGORY"]': {
              column_title: "Category",
            },
          },
        },
      });
    });

    it("should assign the proper colors to a pie", () => {
      H.createDashboard({
        name: "the_dashboard",
      }).then(({ body: { id: dashboardId } }) => {
        H.visitDashboard(dashboardId);
        H.editDashboard();
        H.openQuestionsSidebar();

        H.sidebar().findByText("Pivot table").click();

        H.saveDashboard();

        H.openLegacyStaticEmbeddingModal({
          resource: "dashboard",
          resourceId: dashboardId,
        });
        H.publishChanges("dashboard", () => {});

        H.visitEmbeddedPage(
          {
            resource: { dashboard: dashboardId as number },
            params: {},
          },
          {
            additionalHashOptions: {
              locale: "fr",
            },
          },
        );

        cy.wait("@dashboard");

        H.getDashboardCard(0).within(() => {
          cy.findByText("La catégorie").should("exist");
        });
      });
    });
  });

  describe("card titles and descriptions", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      uploadTranslationDictionaryViaAPI([
        { locale: "fr", msgid: "Gadget", msgstr: "Le gadget" },
        { locale: "fr", msgid: "Doohickey", msgstr: "Le doohickey" },
        { locale: "fr", msgid: "Gizmo", msgstr: "Le gizmo" },
        { locale: "fr", msgid: "Widget", msgstr: "Le widget" },
        {
          locale: "fr",
          msgid: "Products by Category (Pie)",
          msgstr: "Produits par catégorie (Camembert)",
        },
        {
          locale: "fr",
          msgid: "A breakdown of products by category",
          msgstr: "Une répartition des produits par catégorie",
        },
      ]);

      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
      cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");

      cy.signInAsAdmin();

      H.createQuestion(ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY, {
        idAlias: "productsCountByCreatedAtQuestionId",
        wrapId: true,
      });

      H.createQuestion(
        {
          ...PRODUCTS_COUNT_BY_CATEGORY_PIE,
          description: "A breakdown of products by category",
        },
        {
          idAlias: "productsCountByCategoryPieQuestionId",
          wrapId: true,
        },
      );
    });

    it("should translate guest embeds dashboard card titles and descriptions", () => {
      H.createDashboard({
        name: "the_dashboard",
      }).then(({ body: { id: dashboardId } }) => {
        H.visitDashboard(dashboardId);
        H.editDashboard();
        H.openQuestionsSidebar();

        H.sidebar().findByText(PRODUCTS_COUNT_BY_CATEGORY_PIE.name).click();
        H.saveDashboard();

        H.openLegacyStaticEmbeddingModal({
          resource: "dashboard",
          resourceId: dashboardId,
        });
        H.publishChanges("dashboard", () => {});

        H.visitEmbeddedPage(
          {
            resource: { dashboard: dashboardId as number },
            params: {},
          },
          {
            additionalHashOptions: {
              locale: "fr",
            },
          },
        );

        cy.wait("@dashboard");
        cy.wait("@cardQuery");

        // Check that the title is translated
        cy.findByText("Produits par catégorie (Camembert)").should("exist");

        H.getDashboardCard(0).realHover().icon("info").realHover();
        H.tooltip().within(() => {
          // Check that the description is translated
          cy.findByText("Une répartition des produits par catégorie").should(
            "exist",
          );
        });
      });
    });
  });

  describe("values translation", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      uploadTranslationDictionaryViaAPI([
        { locale: "fr", msgid: "Gadget", msgstr: "Le gadget" },
        { locale: "fr", msgid: "Doohickey", msgstr: "Le doohickey" },
        { locale: "fr", msgid: "Gizmo", msgstr: "Le gizmo" },
        { locale: "fr", msgid: "Widget", msgstr: "Le widget" },
      ]);

      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
      cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");

      cy.signInAsAdmin();

      H.createQuestion(ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY, {
        idAlias: "productsCountByCreatedAtQuestionId",
        wrapId: true,
      });

      H.createQuestion(
        {
          ...PRODUCTS_COUNT_BY_CATEGORY_PIE,
          visualization_settings: {
            "pie.rows": [
              ["Widget", "#69C8C8"],
              ["Gadget", "#C7EAEA"],
              ["Gizmo", "#98D9D9"],
              ["Doohickey", "#F3F3F4"],
            ].map(([key, color]) => ({
              key,
              name: key,
              originalName: key,
              color,
              defaultColor: false,
              enabled: true,
              hidden: false,
              isOther: false,
            })),
          },
        },
        {
          idAlias: "productsCountByCategoryPieQuestionId",
          wrapId: true,
        },
      );
    });

    it("should assign the proper colors to a pie", () => {
      H.createDashboard({
        name: "the_dashboard",
      }).then(({ body: { id: dashboardId } }) => {
        H.visitDashboard(dashboardId);
        H.editDashboard();
        H.openQuestionsSidebar();

        H.sidebar().findByText(PRODUCTS_COUNT_BY_CATEGORY_PIE.name).click();
        H.saveDashboard();

        H.openLegacyStaticEmbeddingModal({
          resource: "dashboard",
          resourceId: dashboardId,
        });
        H.publishChanges("dashboard", () => {});

        H.visitEmbeddedPage(
          {
            resource: { dashboard: dashboardId as number },
            params: {},
          },
          {
            additionalHashOptions: {
              locale: "fr",
            },
          },
        );

        cy.wait("@dashboard");
        cy.wait("@cardQuery");

        H.getDashboardCard(0).within(() => {
          cy.findAllByText("Le gadget").should("exist");
          cy.findAllByText("Le doohickey").should("exist");
          cy.findAllByText("Le gizmo").should("exist");
          cy.findAllByText("Le widget").should("exist");

          // Verify colors
          cy.findByTestId("chart-legend").within(() => {
            cy.get("button [color]").then(($elements) => {
              const actualColors = Array.from($elements).map((el) =>
                el.getAttribute("color"),
              );
              expect(actualColors).to.deep.equal([
                "#69C8C8",
                "#C7EAEA",
                "#98D9D9",
                "#F3F3F4",
              ]);
            });
          });
        });
      });
    });

    it("should translate guest embeds dashboard values on visualizer cards (metabase#62373)", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);

      H.editDashboard();
      H.removeDashboardCard(0);
      H.openQuestionsSidebar();

      // Add the regular question
      H.sidebar()
        .findByText(ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name)
        .click();

      // Add the visualizer question
      H.clickVisualizeAnotherWay(
        ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name,
      );
      H.selectVisualization("bar");
      H.saveDashcardVisualizerModal({ mode: "create" });
      H.saveDashboard();

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: ORDERS_DASHBOARD_ID,
      });
      H.publishChanges("dashboard", () => {});

      H.visitEmbeddedPage(
        {
          resource: { dashboard: ORDERS_DASHBOARD_ID as number },
          params: {},
        },
        {
          additionalHashOptions: {
            locale: "fr",
          },
        },
      );

      cy.wait("@dashboard");
      cy.wait("@cardQuery");
      cy.wait("@cardQuery");

      H.getDashboardCard(0).within(() => {
        cy.findAllByText("Le gadget").should("exist");
        cy.findAllByText("Le doohickey").should("exist");
        cy.findAllByText("Le gizmo").should("exist");
        cy.findAllByText("Le widget").should("exist");
      });

      H.getDashboardCard(1).within(() => {
        cy.findAllByText("Le gadget").should("exist");
        cy.findAllByText("Le doohickey").should("exist");
        cy.findAllByText("Le gizmo").should("exist");
        cy.findAllByText("Le widget").should("exist");
      });
    });
  });

  describe("measure names", () => {
    before(() => {
      cy.intercept("POST", "/api/ee/content-translation/upload-dictionary").as(
        "uploadDictionary",
      );

      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      uploadTranslationDictionaryViaAPI([
        ...germanFieldNames,
        ...germanFieldValues,
        ...frenchNames,
        ...frenchBooleanTranslations,
      ]);
      H.snapshot("with-translations");
    });

    beforeEach(() => {
      cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");
      cy.intercept("GET", "/api/embed/dashboard/**/card/*").as("cardQuery");
      cy.intercept("GET", "/api/embed/dashboard/**/search/*").as("searchQuery");
      H.restore("with-translations" as any);
    });

    it("should translate pivot table measure names", () => {
      const pivotQuestionDetails: StructuredQuestionDetails = {
        name: "Pivot Table Test",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ["field", ORDERS.QUANTITY, null],
          ],
        },
        display: "pivot",
        visualization_settings: {
          "pivot_table.column_split": {
            rows: [ORDERS.CREATED_AT, ORDERS.QUANTITY] as any,
            columns: [],
            values: ["count"],
          },
          column_settings: {
            '["name","count"]': {
              column_title: "Price",
            },
          },
        },
      };

      H.createQuestionAndDashboard({
        questionDetails: pivotQuestionDetails,
        dashboardDetails: {
          name: "Pivot Dashboard Test",
          enable_embedding: true,
          embedding_params: {},
        },
      }).then(({ body: { dashboard_id } }) => {
        H.visitEmbeddedPage(
          {
            resource: { dashboard: dashboard_id as number },
            params: {},
          },
          {
            additionalHashOptions: {
              locale: "de",
            },
          },
        );

        cy.wait("@dashboard");

        H.getDashboardCard(0).within(() => {
          cy.findByText("Preis").should("exist");
        });
      });
    });
  });

  describe("filters and field values", () => {
    describe("ee", () => {
      before(() => {
        cy.intercept(
          "POST",
          "/api/ee/content-translation/upload-dictionary",
        ).as("uploadDictionary");

        H.restore();
        cy.signInAsAdmin();
        H.activateToken("bleeding-edge");

        uploadTranslationDictionaryViaAPI([
          ...germanFieldNames,
          ...germanFieldValues,
          ...frenchNames,
          ...frenchBooleanTranslations,
        ]);
        H.snapshot("with-translations");
      });

      beforeEach(() => {
        cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");
        cy.intercept("GET", "/api/embed/dashboard/**/card/*").as("cardQuery");
        cy.intercept("GET", "/api/embed/dashboard/**/search/*").as(
          "searchQuery",
        );
        H.restore("with-translations" as any);
      });

      [{ isMultiSelect: true }, { isMultiSelect: false }].forEach(
        ({ isMultiSelect }) => {
          it(`can filter products table via localized, ${isMultiSelect ? "multiselect" : "single-select"} list widget and see localized values`, () => {
            const productCategoryFilter = {
              name: "Category",
              slug: "product_category",
              id: "11d79abe",
              type: "string/=",
              sectionId: "string",
              isMultiSelect,
            };
            cy.signInAsAdmin();
            H.createQuestionAndDashboard({
              questionDetails: {
                name: "Products question",
                query: {
                  "source-table": PRODUCTS_ID,
                  limit: 30,
                },
              },
              dashboardDetails: {
                parameters: [productCategoryFilter],
                enable_embedding: true,
                embedding_params: {
                  [productCategoryFilter.slug]: "enabled",
                },
              },
            }).then(({ body: { id, card_id, dashboard_id } }) => {
              cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
                dashcards: [
                  {
                    id,
                    card_id,
                    row: 0,
                    col: 0,
                    size_x: 24,
                    size_y: 20,
                    parameter_mappings: [
                      {
                        parameter_id: productCategoryFilter.id,
                        card_id,
                        target: [
                          "dimension",
                          ["field", PRODUCTS.CATEGORY, null],
                        ],
                      },
                    ],
                  },
                ],
              });
              H.visitEmbeddedPage(
                {
                  resource: { dashboard: dashboard_id as number },
                  params: {},
                },
                {
                  additionalHashOptions: {
                    locale: "de",
                  },
                },
              );
              cy.wait("@cardQuery");

              cy.log("Before filtering, multiple categories are shown");
              H.tableInteractiveBody().within(() => {
                cy.findAllByText(/Dingsbums/).should(
                  "have.length.greaterThan",
                  2,
                );
                cy.findAllByText(/Apparat/).should(
                  "have.length.greaterThan",
                  2,
                );
                cy.findAllByText(/Gerät/).should("have.length.greaterThan", 2);
                cy.findAllByText(/Steuerelement/).should(
                  "have.length.greaterThan",
                  2,
                );
              });

              cy.log("Non-categorical string values are translated");
              cy.findByText("Rustic Paper Wallet").should("not.exist");
              cy.findByText("Rustikale Papierbörse").should("be.visible");

              cy.log("After filtering, only selected categories are shown");
              H.filterWidget().findByText("Kategorie").click();
              H.popover().within(() => {
                cy.findByText(/Dingsbums/).click();
                if (isMultiSelect) {
                  cy.findByText(/Apparat/).click();
                }
                cy.findByText(/Füge einen Filter hinzu/).click();
              });
              H.tableInteractiveBody().within(() => {
                cy.findAllByText(/Dingsbums/).should(
                  "have.length.greaterThan",
                  2,
                );
                if (isMultiSelect) {
                  cy.findAllByText(/Apparat/).should(
                    "have.length.greaterThan",
                    2,
                  );
                } else {
                  cy.findByText(/Apparat/).should("not.exist");
                }
                cy.findByText(/Gerät/).should("not.exist");
                cy.findByText(/Steuerelement/).should("not.exist");
              });
            });
          });
        },
      );

      it("translates boolean content in filters and cards", () => {
        const booleanFilter = {
          name: "Boolean Filter",
          slug: "boolean_filter",
          id: "boolean-filter-id",
          type: "boolean/=",
          sectionId: "boolean",
          default: true,
        };

        cy.signInAsAdmin();
        H.createQuestionAndDashboard({
          questionDetails: {
            name: "Boolean Question",
            query: {
              "source-table": ACCOUNTS_ID,
              aggregation: [["count"]],
              breakout: [
                [
                  "field",
                  ACCOUNTS.TRIAL_CONVERTED,
                  {
                    "base-type": "type/Boolean",
                  },
                ],
                [
                  "field",
                  ACCOUNTS.ACTIVE_SUBSCRIPTION,
                  {
                    "base-type": "type/Boolean",
                  },
                ],
              ],
            },
          },
          dashboardDetails: {
            parameters: [booleanFilter],
            enable_embedding: true,
            embedding_params: {
              [booleanFilter.slug]: "enabled",
            },
          },
        }).then(({ body: { id, card_id, dashboard_id } }) => {
          cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
            dashcards: [
              {
                id,
                card_id,
                row: 0,
                col: 0,
                size_x: 24,
                size_y: 20,
                parameter_mappings: [
                  {
                    card_id,
                    parameter_id: booleanFilter.id,
                    target: [
                      "dimension",
                      [
                        "field",
                        "ACTIVE_SUBSCRIPTION",
                        {
                          "base-type": "type/Boolean",
                        },
                      ],
                      {
                        "stage-number": 1,
                      },
                    ],
                  },
                ],
              },
            ],
          });
          H.visitEmbeddedPage(
            {
              resource: { dashboard: dashboard_id as number },
              params: {},
            },
            {
              additionalHashOptions: {
                locale: "fr",
              },
            },
          );
          cy.wait("@cardQuery");

          cy.findByTestId("table-body").within(() => {
            cy.findAllByText(/vrai/).should("have.length", 2);
            cy.findAllByText(/true/).should("have.length", 0);
          });
        });
      });

      it("translates MultiAutocomplete values and options", () => {
        const nameFilter = {
          name: "Multi",
          slug: "multi",
          id: "52b05b6d",
          type: "string/=",
          sectionId: "string",
        };

        cy.signInAsAdmin();
        H.createQuestionAndDashboard({
          questionDetails: {
            name: "People question",
            query: {
              "source-table": PEOPLE_ID,
              limit: 30,
              filter: [
                "contains",
                [
                  "field",
                  PEOPLE.NAME,
                  {
                    "base-type": "type/Text",
                  },
                ],
                "Fran",
                {
                  "case-sensitive": false,
                },
              ],
            },
          },
          dashboardDetails: {
            parameters: [nameFilter],
            enable_embedding: true,
            embedding_params: {
              [nameFilter.slug]: "enabled",
            },
          },
        }).then(({ body: { id, card_id, dashboard_id } }) => {
          cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
            dashcards: [
              {
                id,
                card_id,
                row: 0,
                col: 0,
                size_x: 24,
                size_y: 20,
                parameter_mappings: [
                  {
                    parameter_id: nameFilter.id,
                    card_id,
                    target: ["dimension", ["field", PEOPLE.NAME, null]],
                  },
                ],
              },
            ],
          });
          H.visitEmbeddedPage(
            {
              resource: { dashboard: dashboard_id as number },
              params: {},
            },
            {
              additionalHashOptions: {
                locale: "fr",
              },
            },
          );
          cy.wait("@cardQuery");

          H.tableInteractiveBody().within(() => {
            // all rows should be visible initially
            cy.findAllByRole("row").should("have.length.greaterThan", 2);
            cy.findByText(/Glacia Froskeon/).should("exist");
            cy.findByText(/Hammera Francite/).should("exist");
            cy.findByText(/Francesca Gleason/).should("not.exist");
            cy.findByText(/Francesca Hammes/).should("not.exist");
          });

          H.filterWidget().findByText("Multi").click();
          // Search matches against untranslated text, hence "Fran" matching these names
          cy.findByPlaceholderText("Recherche dans la liste").type("Fran");
          cy.wait("@searchQuery");
          cy.findByTestId("parameter-value-dropdown").within(() => {
            cy.findByText(/Glacia Froskeon/).click();
            cy.button(/Ajouter un filtre/).click();
          });

          H.tableInteractiveBody().within(() => {
            // only the row matching the selection
            cy.findAllByRole("row").should("have.length", 1);
            cy.findByText(/Glacia Froskeon/).should("exist");
            cy.findByText(/Hammera Francite/).should("not.exist");
            cy.findByText(/Francesca Gleason/).should("not.exist");
            cy.findByText(/Francesca Hammes/).should("not.exist");
          });

          cy.findByTestId("parameter-widget").click();
          // Search matches against untranslated text, hence "Fran" matching these names
          cy.findByPlaceholderText("Recherche dans la liste").type("Fran");
          cy.findByText(/Hammera Francite/).click();
          cy.realPress("Escape");
          cy.findByTestId("parameter-value-dropdown")
            .button(/Mettre à jour le filtre/)
            .click();

          H.tableInteractiveBody().within(() => {
            // only the two rows matching the selection
            cy.findAllByRole("row").should("have.length", 2);
            cy.findByText(/Glacia Froskeon/).should("exist");
            cy.findByText(/Hammera Francite/).should("exist");
            cy.findByText(/Francesca Gleason/).should("not.exist");
            cy.findByText(/Francesca Hammes/).should("not.exist");
          });
        });
      });
    });
  });

  describe("tab names and text cards", () => {
    const translations: DictionaryArray = [
      { locale: "de", msgid: "Tab 1", msgstr: "Reiter 1" },
      { locale: "de", msgid: "Tab 2", msgstr: "Reiter 2" },
      { locale: "de", msgid: "Sample Heading", msgstr: "Beispielüberschrift" },
      { locale: "de", msgid: "Sample Text", msgstr: "Beispieltext" },
    ];
    type VisitWithLocale = (options?: { locale?: string }) => void;
    let visitEmbeddedDashboard = null as unknown as VisitWithLocale,
      visitNormalDashboard = null as unknown as VisitWithLocale;

    before(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      uploadTranslationDictionaryViaAPI(translations);
      cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
        enable_embedding: true,
        tabs: [
          H.getDashboardTabDetails({
            name: "Tab 1",
            id: 100,
          }),
          H.getDashboardTabDetails({
            name: "Tab 2",
            id: 101,
          }),
        ],
        dashcards: [
          H.getHeadingCardDetails({
            col: 0,
            text: "Sample Heading",
            dashboard_tab_id: 100,
          }),
          H.getTextCardDetails({
            col: 0,
            text: "Sample Text",
            dashboard_tab_id: 100,
          }),
        ],
      } satisfies DashboardDetails);
      H.snapshot("tab-names-and-text-cards");
    });

    beforeEach(() => {
      cy.intercept("POST", "api/ee/content-translation/upload-dictionary").as(
        "uploadDictionary",
      );
      H.restore("tab-names-and-text-cards" as any);
      cy.signInAsAdmin();
      visitEmbeddedDashboard = ({ locale = "de" } = {}) => {
        H.visitEmbeddedPage(
          {
            resource: { dashboard: ORDERS_DASHBOARD_ID },
            params: {},
          },
          {
            additionalHashOptions: {
              locale,
            },
          },
        );
      };
      visitNormalDashboard = ({ locale = "de" } = {}) => {
        cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, { locale });
        cy.signInAsNormalUser();
        H.visitDashboard(ORDERS_DASHBOARD_ID);
      };
    });

    it("should translate text in dashboard tab names", () => {
      visitEmbeddedDashboard();
      cy.findByRole("tab", { name: "Reiter 1" }).should("be.visible");
      cy.findByRole("tab", { name: "Reiter 2" }).should("be.visible");
    });

    it("should translate content in heading cards", () => {
      visitEmbeddedDashboard();
      H.getDashboardCard(0)
        .findByText(/Beispielüberschrift/)
        .should("be.visible");
    });

    it("should translate content in text cards", () => {
      visitEmbeddedDashboard();
      H.getDashboardCard(1)
        .findByText(/Beispieltext/)
        .should("be.visible");
    });

    it("translations of tab names and text cards do not break normal dashboard", () => {
      visitNormalDashboard();
      cy.findByRole("tab", { name: "Tab 1" }).should("be.visible");
      cy.findByRole("tab", { name: "Tab 2" }).should("be.visible");
      cy.findAllByTestId("dashcard")
        .contains(/Sample Heading/)
        .should("be.visible");
      cy.findAllByTestId("dashcard")
        .contains(/Sample Text/)
        .should("be.visible");
    });
  });

  describe("Boolean content", () => {});
});
