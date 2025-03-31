import type { DictionaryArray, DictionaryResponse } from "metabase/i18n/types";

export const getCSVWithHeaderRow = (dictionary: DictionaryArray) => {
  const header = ["Language", "String", "Translation"];
  return [header, ...dictionary]
    .map((row) => Object.values(row).join(","))
    .join("\n");
};

export const uploadTranslationDictionary = (rows: DictionaryArray) => {
  cy.signInAsAdmin();
  cy.visit("/admin/settings/localization");
  cy.findByTestId("content-localization-setting").findByText(
    /Upload translation dictionary/,
  );
  cy.get("#content-translation-dictionary-upload-input").selectFile(
    {
      contents: Cypress.Buffer.from(getCSVWithHeaderRow(rows)),
      fileName: "file.csv",
      mimeType: "text/csv",
    },
    { force: true },
  );
};

export const assertOnlyTheseTranslationsAreStored = (rows: DictionaryArray) => {
  cy.log("A normal user should be able to get the translations via the API");
  cy.signInAsNormalUser();
  cy.request<DictionaryResponse>(
    "GET",
    "/api/ee/content-translation/dictionary",
  ).then((interception) => {
    const { data } = interception.body;
    const msgstrs = data.map((row) => row.msgstr);
    expect(msgstrs.toSorted()).to.deep.equal(
      rows.map((row) => row.msgstr).toSorted(),
      `The expected translations (length: ${rows.length}) match the actual translations (length: ${msgstrs.length})`,
    );
  });
};

export const assertAdminSummarizesTranslations = (
  localeNameToTranslationCount: Record<string, number>,
) => {
  cy.log("Translations should be described in admin");
  cy.signInAsAdmin();
  cy.visit("/admin/settings/localization");

  cy.findByTestId("content-localization-setting").within(() => {
    Object.entries(localeNameToTranslationCount).forEach(
      ([localeName, count]) => {
        cy.findByText(
          new RegExp(
            `${
              // Escape locale names with parens
              localeName.replace(/[()]/g, "\\$&")
            }.*${count} translation`,
            "i",
          ),
        ).should("be.visible");
      },
    );
  });
};
