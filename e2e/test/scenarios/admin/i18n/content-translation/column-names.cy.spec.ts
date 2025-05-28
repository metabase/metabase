import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

import { germanFieldNames } from "./constants";
import {
  interceptContentTranslationRoutes,
  uploadTranslationDictionary,
} from "./helpers/e2e-content-translation-helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

describe("scenarios > content translation > column names", () => {
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
        H.snapshot("translations-uploaded");
      });

      describe("on the question page", () => {
        let productsQuestionId = null as unknown as number;

        before(() => {
          cy.get<number>("@productsQuestionId").then((id) => {
            productsQuestionId = id;
          });
        });

        it("when locale is English, column names are NOT localized in column headers", () => {
          H.snapshot("translations-uploaded");
          cy.signInAsNormalUser();
          H.visitQuestion(productsQuestionId);
          cy.findByTestId("table-header").within(() => {
            germanFieldNames.forEach((row) => {
              cy.findByText(row.msgid).should("be.visible");
              cy.findByText(row.msgstr).should("not.exist");
            });
          });
        });

        it("when locale is German, column names ARE localized in column headers", () => {
          H.snapshot("translations-uploaded");
          cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, {
            locale: "de",
          });
          cy.signInAsNormalUser();
          H.visitQuestion(productsQuestionId);
          cy.findByTestId("table-header").within(() => {
            germanFieldNames.forEach((row) => {
              cy.findByText(row.msgid).should("not.exist");
              cy.findByText(row.msgstr).should("be.visible");
            });
          });
        });
      });
    });
  });
});
