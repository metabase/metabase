import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";
import { uploadTranslationDictionaryViaAPI } from "e2e/support/helpers/e2e-content-translation-helpers";

import { germanFieldNames } from "./constants";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

describe("scenarios > content translation > guest embeds > questions", () => {
  describe("ee", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/ee/content-translation/upload-dictionary").as(
        "uploadDictionary",
      );
    });

    let productsQuestionId = null as unknown as number;

    before(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

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

    let visitEmbeddedQuestion = null as unknown as ({
      locale,
    }: {
      locale: string;
    }) => void;

    beforeEach(() => {
      H.restore("snapshot-for-questions" as any);
      visitEmbeddedQuestion = ({ locale }) => {
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
    });

    it("when locale is English, column names are NOT localized in column headers", () => {
      visitEmbeddedQuestion({ locale: "en" });
      cy.findByTestId("table-header").within(() => {
        germanFieldNames.forEach((row) => {
          cy.findByText(row.msgid).should("be.visible");
          cy.findByText(row.msgstr).should("not.exist");
        });
      });
    });

    it("when locale is German, column names ARE localized in column headers", () => {
      visitEmbeddedQuestion({ locale: "de" });
      cy.findByTestId("table-header").within(() => {
        germanFieldNames.forEach((row) => {
          cy.findByText(row.msgid).should("not.exist");
          cy.findByText(row.msgstr).should("be.visible");
        });
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
