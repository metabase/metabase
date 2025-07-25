import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  NORMAL_USER_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  DashboardDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { DictionaryArray } from "metabase/i18n/types";

import {
  frenchBooleanTranslations,
  germanFieldNames,
  germanFieldValues,
} from "./constants";
import { uploadTranslationDictionaryViaAPI } from "./helpers/e2e-content-translation-helpers";

const { PRODUCTS, PRODUCTS_ID, ACCOUNTS, ACCOUNTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const questionDetails: StructuredQuestionDetails = {
  name: "Products question",
  query: {
    "source-table": PRODUCTS_ID,
    limit: 30,
  },
};

describe("scenarios > content translation > static embedding > dashboards", () => {
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
          ...frenchBooleanTranslations,
        ]);
        H.snapshot("with-translations");
      });

      beforeEach(() => {
        cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");
        cy.intercept("GET", "/api/embed/dashboard/**/card/*").as("cardQuery");
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

            const dashboardDetails: DashboardDetails = {
              parameters: [productCategoryFilter],
              enable_embedding: true,
              embedding_params: {
                [productCategoryFilter.slug]: "enabled",
              },
            };

            cy.signInAsAdmin();
            H.createQuestionAndDashboard({
              questionDetails,
              dashboardDetails,
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
              cy.findByTestId("table-body").within(() => {
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
              cy.findByTestId("table-body").within(() => {
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

          H.filterWidget().contains("vrai");
          cy.findByTestId("table-body").within(() => {
            cy.findAllByText(/vrai/).should("have.length", 2);
            cy.findAllByText(/true/).should("have.length", 0);
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
