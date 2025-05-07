import type { DictionaryArray, DictionaryResponse } from "metabase-types/api";

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
  cy.wait("@uploadDictionary");
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

export const generateLargeCSV = ({
  sizeInMebibytes,
}: {
  sizeInMebibytes: number;
}) => {
  const oneMebibyte = 2 ** 20;
  const charsPerRow = 100;
  const totalRows = Math.floor((sizeInMebibytes * oneMebibyte) / charsPerRow);
  const header = "locale,string,translation\n";
  const row = "de,data2,data3\n";
  const largeCSV = header + row.repeat(totalRows);
  return largeCSV;
};
