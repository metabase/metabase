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

      beforeEach(() => {
        interceptContentTranslationRoutes();
        H.restore("translations-uploaded" as any);
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
            H.restore("translations-uploaded" as any);
            cy.signInAsNormalUser();
          });

          it("column headers", () => {
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
            cy.signInAsAdmin();
            H.restore("translations-uploaded" as any);
            cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, {
              locale: "de",
            });
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
        });
      });
    });
  });
});
