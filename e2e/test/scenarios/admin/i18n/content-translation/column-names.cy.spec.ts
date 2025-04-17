import type { DictionaryArrayRow } from "metabase/i18n/types";

import { getCSV } from "./helpers/e2e-content-translation-helpers";

const { H } = cy;

const translationsOfColumnNames: [DictionaryArrayRow, ...DictionaryArrayRow[]] =
  [
    { locale: "de", msgid: "Title", msgstr: "Titel" },
    { locale: "de", msgid: "Vendor", msgstr: "Anbieter" },
    { locale: "de", msgid: "Rating", msgstr: "Bewertung" },
    { locale: "de", msgid: "Category", msgstr: "Kategorie" },
    { locale: "de", msgid: "Created At", msgstr: "Erstellt am" },
    { locale: "de", msgid: "Price", msgstr: "Preis" },
  ];

describe("scenarios > admin > localization > content translation", () => {
  describe("ee", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
    });

    describe("column names", () => {
      describe("after uploading related German translations", () => {
        before(() => {
          cy.signInAsAdmin();
          cy.visit("/admin/settings/localization");
          const columnNamesCSV = getCSV(translationsOfColumnNames);
          cy.get("#content-translation-dictionary-upload-input").selectFile(
            {
              contents: Cypress.Buffer.from(columnNamesCSV),
              fileName: "content_translations.csv",
              mimeType: "text/csv",
            },
            { force: true },
          );

          cy.findByTestId("content-localization-setting")
            .findByText(/Dictionary uploaded/g)
            .should("be.visible");

          H.createQuestion(
            {
              name: "Products",
              query: {
                "source-table": PRODUCTS_ID,
              },
            },
            { wrapId: true, idAlias: "productsQuestionId" },
          );
        });

        beforeEach(() => {
          cy.signInAsAdmin();
        });

        describe("on the question page", () => {
          let productsQuestionId = null as unknown as number;

          before(() => {
            cy.get<number>("@productsQuestionId").then((id) => {
              productsQuestionId = id;
            });
          });

          beforeEach(() => {
            cy.signInAsNormalUser();
          });

          describe("when locale is English, column names are NOT localized in", () => {
            it("column headers", () => {
              H.visitQuestion(productsQuestionId);
              cy.findByTestId("table-header").within(() => {
                translationsOfColumnNames.forEach((row) => {
                  cy.findByText(row.msgid).should("be.visible");
                  cy.findByText(row.msgstr).should("not.exist");
                });
              });
            });

            it("filter popover", () => {
              H.visitQuestion(productsQuestionId);

              H.filter();

              Object.values(translationsOfColumnNames).forEach((row) => {
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
                cy.log(
                  "Summarize sidebar includes all column names in English",
                );
                Object.values(translationsOfColumnNames).forEach((row) => {
                  cy.findByText(row.msgstr).should("not.exist");
                  cy.findByText(row.msgid).should("be.visible");
                });
              });
            });

            it("dashcard parameter mapper", () => {
              openDashCardCardParameterMapper();

              H.popover().within(() => {
                Object.values(translationsOfColumnNames)
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
              cy.signInAsNormalUser();
              cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, {
                locale: "de",
              });
            });

            it("column headers", () => {
              H.visitQuestion(productsQuestionId);
              cy.findByTestId("table-header").within(() => {
                translationsOfColumnNames.forEach((row) => {
                  cy.findByText(row.msgid).should("not.exist");
                  cy.findByText(row.msgstr).should("be.visible");
                });
              });
            });

            it("filter popover", () => {
              H.visitQuestion(productsQuestionId);
              // Filter is 'Filter' in German
              H.initiateAction("Filter");

              cy.findAllByTestId("dimension-list-item").then(($elements) => {
                const itemNames = $elements.map((_i, el) => el.innerText).get();
                expect(
                  itemNames.indexOf("Kategorie"),
                  "Kategorie should be sorted after Erstellt am",
                ).to.be.greaterThan(itemNames.indexOf("Erstellt am"));
              });

              Object.values(translationsOfColumnNames).forEach((row) => {
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
                cy.findByText(/Kategorie/).should("not.exist");
                cy.findByText(/Preis/).should("not.exist");
                cy.findByText(/Titel/).should("not.exist");
                cy.findByText(/ID/).should("not.exist");
              });
            });

            cy.findByText(/Ean/).should("not.exist");
            cy.findByText(/Anbieter/).should("be.visible");
            cy.findByText(/Bewertung/).should("be.visible");
            cy.findByText(/Erstellt am/).should("be.visible");
          });
        });

        it("summarize sidebar", () => {
          H.visitQuestion(productsQuestionId);
          cy.log("Open summarize sidebar");
          H.initiateAction("Zusammenfassen" as "Summarize");
          H.rightSidebar().within(() => {
            cy.log("Summarize sidebar includes all column names in German");
            Object.values(translationsOfColumnNames).forEach((row) => {
              cy.findByText(row.msgid).should("not.exist");
              cy.findByText(row.msgstr).should("be.visible");
            });

            cy.log("Column names should be sorted in German");
            cy.findAllByTestId("dimension-list-item").then(($elements) => {
              const itemNames = $elements.map((_i, el) => el.innerText).get();
              expect(
                itemNames.indexOf("Kategorie"),
                "Kategorie should be sorted after Erstellt am",
              ).to.be.greaterThan(itemNames.indexOf("Erstellt am"));
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
            Object.values(translationsOfColumnNames)
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
