import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  NORMAL_USER_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { DashboardDetails } from "e2e/support/helpers";
import { uploadTranslationDictionaryViaAPI } from "e2e/support/helpers/e2e-content-translation-helpers";
import {
  ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
} from "e2e/support/test-visualizer-data";
import type { DictionaryArray } from "metabase-types/api";

import { germanFieldNames, germanFieldValues } from "./helpers/constants";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

describe("scenarios > content translation > dashboards and questions", () => {
  describe("guest embeds", () => {
    describe("questions", () => {
      let productsQuestionId: number;

      before(() => {
        H.restore();
        cy.signInAsAdmin();
        H.activateToken("pro-self-hosted");

        H.createQuestion(
          {
            name: "Products question",
            query: {
              "source-table": PRODUCTS_ID,
            },
            enable_embedding: true,
          },
          { wrapId: true, idAlias: "productsQuestionId" },
        );
        uploadTranslationDictionaryViaAPI(germanFieldNames);
        H.snapshot("snapshot-for-questions");

        cy.get<number>("@productsQuestionId").then((id) => {
          productsQuestionId = id;
        });
      });

      beforeEach(() => {
        H.restore("snapshot-for-questions");
      });

      const visitEmbeddedQuestion = ({ locale }: { locale: string }) => {
        H.visitEmbeddedPage(
          {
            resource: { question: productsQuestionId },
            params: {},
          },
          {
            additionalHashOptions: {
              locale,
            },
          },
        );
      };

      it("localizes column headers only when the locale has translations", () => {
        cy.log("English: column names are not localized");
        visitEmbeddedQuestion({ locale: "en" });
        cy.findByTestId("table-header").within(() => {
          germanFieldNames.forEach((row) => {
            cy.findByText(row.msgid).should("be.visible");
            cy.findByText(row.msgstr).should("not.exist");
          });
        });

        cy.log("German: column names are localized");
        visitEmbeddedQuestion({ locale: "de" });
        cy.findByTestId("table-header").within(() => {
          germanFieldNames.forEach((row) => {
            cy.findByText(row.msgid).should("not.exist");
            cy.findByText(row.msgstr).should("be.visible");
          });
        });
      });
    });

    describe("dashboards", () => {
      describe("filters and field values", () => {
        before(() => {
          H.restore();
          cy.signInAsAdmin();
          H.activateToken("pro-self-hosted");

          uploadTranslationDictionaryViaAPI([
            ...germanFieldNames,
            ...germanFieldValues,
          ]);
          H.snapshot("with-translations");
        });

        beforeEach(() => {
          cy.intercept("GET", "/api/embed/dashboard/**/card/*").as("cardQuery");
          H.restore("with-translations");
        });

        it("can filter products table via localized, multiselect list widget and see localized values", () => {
          const productCategoryFilter = {
            name: "Category",
            slug: "product_category",
            id: "11d79abe",
            type: "string/=",
            sectionId: "string",
            isMultiSelect: true,
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
                      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                    },
                  ],
                },
              ],
            });
            H.visitEmbeddedPage(
              {
                // Dashboards created through the API have numeric ids
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
              cy.findAllByText(/Apparat/).should("have.length.greaterThan", 2);
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
              cy.findByText(/Apparat/).click();
              cy.findByText(/Füge einen Filter hinzu/).click();
            });
            H.tableInteractiveBody().within(() => {
              cy.findAllByText(/Dingsbums/).should(
                "have.length.greaterThan",
                2,
              );
              cy.findAllByText(/Apparat/).should("have.length.greaterThan", 2);
              cy.findByText(/Gerät/).should("not.exist");
              cy.findByText(/Steuerelement/).should("not.exist");
            });
          });
        });
      });

      describe("visualizer cards", () => {
        beforeEach(() => {
          H.restore();
          cy.signInAsAdmin();
          H.activateToken("pro-self-hosted");

          uploadTranslationDictionaryViaAPI([
            { locale: "fr", msgid: "Gadget", msgstr: "Le gadget" },
            { locale: "fr", msgid: "Doohickey", msgstr: "Le doohickey" },
            { locale: "fr", msgid: "Gizmo", msgstr: "Le gizmo" },
            { locale: "fr", msgid: "Widget", msgstr: "Le widget" },
          ]);

          cy.intercept("GET", "/api/embed/dashboard/**/card/*").as(
            "embedCardQuery",
          );
          cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");

          cy.signInAsAdmin();

          H.createQuestion(ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY, {
            idAlias: "productsCountByCreatedAtQuestionId",
            wrapId: true,
          });

          H.createQuestion(PRODUCTS_COUNT_BY_CATEGORY_PIE, {
            idAlias: "productsCountByCategoryPieQuestionId",
            wrapId: true,
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
              resource: { dashboard: ORDERS_DASHBOARD_ID },
              params: {},
            },
            {
              additionalHashOptions: {
                locale: "fr",
              },
            },
          );

          cy.wait("@dashboard");
          cy.wait("@embedCardQuery");
          cy.wait("@embedCardQuery");

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
    });
  });

  describe("normal app", () => {
    const tabAndTextCardTranslations: DictionaryArray = [
      { locale: "de", msgid: "Tab 1", msgstr: "Reiter 1" },
      { locale: "de", msgid: "Tab 2", msgstr: "Reiter 2" },
      { locale: "de", msgid: "Sample Heading", msgstr: "Beispielüberschrift" },
      { locale: "de", msgid: "Sample Text", msgstr: "Beispieltext" },
    ];

    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

      H.createQuestion(
        {
          name: "Products question",
          query: {
            "source-table": PRODUCTS_ID,
          },
        },
        { wrapId: true, idAlias: "productsQuestionId" },
      );
      uploadTranslationDictionaryViaAPI([
        ...germanFieldNames,
        ...tabAndTextCardTranslations,
      ]);
      cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
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

      cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, { locale: "de" });
      cy.signInAsNormalUser();
    });

    it("translations do not break questions and dashboards in the normal app", () => {
      cy.get<number>("@productsQuestionId").then((productsQuestionId) => {
        H.visitQuestion(productsQuestionId);
      });
      cy.findByTestId("table-header").within(() => {
        germanFieldNames.forEach((row) => {
          cy.log("No fields names are translated");
          cy.findByText(row.msgstr).should("not.exist");
          cy.findByText(row.msgid).should("be.visible");
        });
      });

      H.visitDashboard(ORDERS_DASHBOARD_ID);
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
});
