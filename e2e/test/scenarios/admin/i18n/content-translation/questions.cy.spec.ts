import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

import { germanCustomAxisTitle, germanFieldNames } from "./constants";
import { uploadTranslationDictionaryViaAPI } from "./helpers/e2e-content-translation-helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

describe("scenarios > content translation > static embedding > questions", () => {
  describe("ee", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/ee/content-translation/upload-dictionary").as(
        "uploadDictionary",
      );
    });

    let productsQuestionId = null as unknown as number,
      averageProductPriceQuestionId = null as unknown as number,
      customAxisTitleQuestionId = null as unknown as number;

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
          enable_embedding: true,
        },
        { wrapId: true, idAlias: "productsQuestionId" },
      );

      H.createQuestion(
        {
          name: "Average Product Price",
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
            breakout: [["field", PRODUCTS.CATEGORY, null]],
          },
          enable_embedding: true,
        },
        { wrapId: true, idAlias: "averageProductPriceQuestionId" },
      );

      H.createQuestion(
        {
          name: "Average Product Price - with custom axis title",
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
          },
          visualization_settings: {
            "graph.y_axis.title_text": germanCustomAxisTitle.msgid,
          },
          enable_embedding: true,
        },
        { wrapId: true, idAlias: "customAxisTitleQuestionId" },
      );

      uploadTranslationDictionaryViaAPI([
        ...germanFieldNames,
        germanCustomAxisTitle,
      ]);
      H.snapshot("snapshot-for-questions");

      cy.get<number>("@productsQuestionId").then((id) => {
        productsQuestionId = id;
      });
      cy.get<number>("@averageProductPriceQuestionId").then((id) => {
        averageProductPriceQuestionId = id;
      });
      cy.get<number>("@customAxisTitleQuestionId").then((id) => {
        customAxisTitleQuestionId = id;
      });
    });

    let visitEmbeddedQuestion = null as unknown as ({
      locale,
      questionId,
    }: {
      locale: string;
      questionId?: number;
    }) => void;

    beforeEach(() => {
      H.restore("snapshot-for-questions" as any);
      visitEmbeddedQuestion = ({ locale, questionId }) => {
        H.visitEmbeddedPage(
          {
            resource: { question: questionId },
            params: {},
          },
          {
            additionalHashOptions: {
              locale,
            },
          },
        );
      };
    });

    it("when locale is English, column names are *not* localized in column headers", () => {
      visitEmbeddedQuestion({ locale: "en", questionId: productsQuestionId });
      cy.findByTestId("table-header").within(() => {
        germanFieldNames.forEach((row) => {
          cy.findByText(row.msgid).should("be.visible");
          cy.findByText(row.msgstr).should("not.exist");
        });
      });
    });

    it("when locale is German, column names are localized in column headers", () => {
      visitEmbeddedQuestion({ locale: "de", questionId: productsQuestionId });
      cy.findByTestId("table-header").within(() => {
        germanFieldNames.forEach((row) => {
          cy.findByText(row.msgid).should("not.exist");
          cy.findByText(row.msgstr).should("be.visible");
        });
      });
    });

    // TODO: I still see "Durchschnitt von Price". The column name is not
    // getting localized. But it was working before. I guess I need to look
    // back through the git log.
    it.only("when locale is German, aggregate column names are localized in column headers", () => {
      visitEmbeddedQuestion({
        locale: "de",
        questionId: averageProductPriceQuestionId,
      });
      cy.findByTestId("table-header").within(() => {
        cy.findByText("Average of Price").should("not.exist");
        cy.findByText("Durchschnitt von Preis").should("be.visible");
      });
    });

    it("when locale is German, custom axis titles are localized", () => {
      visitEmbeddedQuestion({
        locale: "de",
        questionId: customAxisTitleQuestionId,
      });
      cy.findByTestId("table-header").within(() => {
        cy.findByText(germanCustomAxisTitle.msgid).should("not.exist");
        cy.findByText(germanCustomAxisTitle.msgstr).should("be.visible");
      });
    });

    it("translations do not break questions in the normal app", () => {
      cy.signInAsNormalUser();
      cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, { locale: "de" });
      H.visitQuestion(productsQuestionId);
      cy.findByTestId("table-header").within(() => {
        germanFieldNames.forEach((row) => {
          cy.log("No fields names are translated");
          cy.findByText(row.msgstr).should("not.exist");
          cy.findByText(row.msgid).should("be.visible");
        });
      });
    });
  });
});
