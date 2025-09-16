import { parse } from "csv-parse/browser/esm/sync";

import { METABASE_SECRET_KEY } from "e2e/support/cypress_data";
import type { DictionaryArray, DictionaryResponse } from "metabase-types/api";
import { isDictionaryArray } from "metabase-types/guards/content-translation";

export const getCSVWithHeaderRow = (dictionary: DictionaryArray) => {
  const header = ["Language", "String", "Translation"];
  return [header, ...dictionary]
    .map((row) => Object.values(row).join(","))
    .join("\n");
};

export const uploadTranslationDictionary = (rows: DictionaryArray) => {
  cy.intercept("POST", "/api/ee/content-translation/upload-dictionary").as(
    "uploadDictionary",
  );
  cy.intercept("GET", "/api/setting").as("getSettings");
  cy.signInAsAdmin();
  cy.visit("/admin/embedding/static");
  cy.wait("@getSettings");

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

  cy.findByRole("dialog", { name: /upload new dictionary/i })
    .button("Replace existing dictionary")
    .click();

  cy.wait("@uploadDictionary");

  cy.findByRole("heading", {
    name: "Translate embedded dashboards and questions",
  }).scrollIntoView();
};

export const uploadTranslationDictionaryViaAPI = (rows: DictionaryArray) => {
  cy.signInAsAdmin();
  const csvString = getCSVWithHeaderRow(rows);
  const fileBlob = new Blob([csvString], { type: "text/csv" });
  const formData = new FormData();
  formData.append("file", fileBlob, "dictionary.csv");

  return cy
    .request({
      method: "POST",
      url: "/api/ee/content-translation/upload-dictionary",
      body: formData,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    })
    .then((response) => {
      expect(response.status).to.equal(200);
    });
};

export const assertOnlyTheseTranslationsAreStored = (
  rows: DictionaryArray,
  locale = "de",
) => {
  return cy
    .task("signJwt", {
      payload: {
        question: 1,
        exp: Math.round(Date.now() / 1000) + 10 * 60,
      },
      secret: METABASE_SECRET_KEY,
    })
    .then((jwtToken) => {
      cy.log(
        "A normal user should be able to get the translations via the API",
      );
      cy.signInAsNormalUser();
      cy.request<DictionaryResponse>(
        "GET",
        `/api/ee/content-translation/dictionary/${jwtToken}?locale=${locale}`,
      ).then((interception) => {
        const { data } = interception.body;
        const msgstrs = data.map((row) => row.msgstr);
        expect(msgstrs.toSorted()).to.deep.equal(
          rows.map((row) => row.msgstr).toSorted(),
          `The expected translations (length: ${rows.length}) match the actual translations (length: ${msgstrs.length})`,
        );
      });
    });
};

export const generateLargeCSV = ({
  sizeInMebibytes,
}: {
  sizeInMebibytes: number;
}) => {
  const oneMebibyte = 2 ** 20;
  const row = "de,data2,data3\n";
  const charsPerRow = row.length;
  const totalRows = Math.floor((sizeInMebibytes * oneMebibyte) / charsPerRow);
  const header = "locale,string,translation\n";
  const largeCSV = header + row.repeat(totalRows);
  return largeCSV;
};

export const parseCSVFromString = (str: string): DictionaryArray => {
  try {
    const strings: unknown = parse(str, {
      delimiter: [",", "\t", "\n"],
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
      quote: '"',
      escape: "\\",
    }).flat();
    if (isDictionaryArray(strings)) {
      return strings;
    }
    throw new Error("Invalid dictionary");
  } catch (err) {
    return [];
  }
};
