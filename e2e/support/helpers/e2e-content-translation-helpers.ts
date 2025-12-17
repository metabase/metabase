import type { DictionaryArray } from "metabase-types/api";

export const getCSVWithHeaderRow = (dictionary: DictionaryArray) => {
  const header = ["Language", "String", "Translation"];
  return [header, ...dictionary]
    .map((row) => Object.values(row).join(","))
    .join("\n");
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
