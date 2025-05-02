import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

import { columnNamesWithTypeText, germanFieldNames } from "./constants";
import {
  openDashCardCardParameterMapper,
  uploadTranslationDictionary,
} from "./helpers/e2e-content-translation-helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

/** The rows in the translation dictionary that are actually used in the
 * interface. One word is in the dictionary that we don't want to use in the
 * interface. */
const usedGermanFieldNames = germanFieldNames.filter(
  (row) => row.msgstr !== "Kahl",
);

describe("scenarios > admin > localization > content translation of column names", () => {
  describe("ee", () => {
    before(() => {
      H.restore();
    });
    beforeEach(() => {
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
    });
    describe("after uploading related German translations", () => {
      before(() => {
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
              usedGermanFieldNames.forEach((row) => {
                cy.findByText(row.msgid).should("be.visible");
                cy.findByText(row.msgstr).should("not.exist");
              });
            });
          });

          it("filter popover", () => {
            H.visitQuestion(productsQuestionId);

            H.filter();

            Object.values(usedGermanFieldNames).forEach((row) => {
              H.popover().within(() => {
                cy.findByText(row.msgstr).should("not.exist");
                cy.findByText(row.msgid).click();
              });

              // Within subsequent popover
              H.popover().within(() => {
                cy.findByText(row.msgstr).should("not.exist");
                cy.findByText(row.msgid).click();
                // Clicking the column name returns to the main popover
              });
            });
          });

          it("summarize sidebar", () => {
            H.visitQuestion(productsQuestionId);
            cy.log("Open summarize sidebar");
            H.summarize();
            H.rightSidebar().within(() => {
              cy.log("Summarize sidebar includes all column names in English");
              Object.values(usedGermanFieldNames).forEach((row) => {
                cy.findByText(row.msgstr).should("not.exist");
                cy.findByText(row.msgid).should("be.visible");
              });
            });
          });

          it("dashcard parameter mapper", () => {
            openDashCardCardParameterMapper();

            H.popover().within(() => {
              Object.values(usedGermanFieldNames)
                .filter((tr) => columnNamesWithTypeText.includes(tr.msgid))
                .forEach((row) => {
                  cy.findByText(row.msgstr).should("not.exist");
                  cy.findByText(row.msgid).should("be.visible");
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
              usedGermanFieldNames.forEach((row) => {
                cy.findByText(row.msgid).should("not.exist");
                cy.findByText(row.msgstr).should("be.visible");
              });
            });
          });

          it("filter popover", () => {
            H.visitQuestion(productsQuestionId);
            // Filter is 'Filter' in German
            H.initiateAction("Filter");

            Object.values(usedGermanFieldNames).forEach((row) => {
              H.popover().within(() => {
                cy.findByText(row.msgid).should("not.exist");
                cy.findByText(row.msgstr).click();
              });

              // Within subsequent popover
              H.popover().within(() => {
                cy.findByText(row.msgid).should("not.exist");
                cy.findByText(row.msgstr).click();
                // Clicking the column name returns to the main popover
              });
            });

            cy.log("Column names should be searchable");
            H.popover().within(() => {
              cy.findByPlaceholderText(/Finden/).type("er");
              const translatedColumnNames = usedGermanFieldNames.map(
                (n) => n.msgstr,
              );
              const nonMatches = translatedColumnNames.filter(
                (n) => !/er/i.test(n),
              );
              const matches = translatedColumnNames.filter((n) =>
                /er/i.test(n),
              );
              expect(nonMatches).to.have.length.greaterThan(0);
              expect(matches).to.have.length.greaterThan(0);
              nonMatches.forEach((n) =>
                cy.findByText(new RegExp(n)).should("not.exist"),
              );
              matches.forEach((n) =>
                cy.findByText(new RegExp(n)).should("be.visible"),
              );
            });
          });

          it("summarize sidebar", () => {
            H.visitQuestion(productsQuestionId);
            cy.log("Open summarize sidebar");
            H.initiateAction("Zusammenfassen" as "Summarize");
            H.rightSidebar().within(() => {
              cy.log("Summarize sidebar includes all column names in German");
              Object.values(usedGermanFieldNames).forEach((row) => {
                cy.findByText(row.msgid).should("not.exist");
                cy.findByText(row.msgstr).should("be.visible");
              });

              cy.log("Column names should be searchable");
              cy.findByPlaceholderText(/Finden/).type("kat");
              cy.findByText("Erstellt am").should("not.exist");
              cy.findByText("Kategorie").should("be.visible");
            });
          });

          it("dashcard parameter mapper", () => {
            openDashCardCardParameterMapper();

            H.popover().within(() => {
              Object.values(usedGermanFieldNames)
                .filter((tr) => columnNamesWithTypeText.includes(tr.msgid))
                .forEach((row) => {
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
