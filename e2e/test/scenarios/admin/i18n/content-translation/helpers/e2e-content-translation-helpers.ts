import type { DictionaryArray, DictionaryResponse } from "metabase-types/api";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { H } = cy;

/** Opens the parameter mapper. Works whether the current locale is English or German */
export const openDashCardCardParameterMapper = () => {
  const questionDetails: StructuredQuestionDetails = {
    query: { "source-table": SAMPLE_DATABASE.PRODUCTS_ID },
  };
  H.createQuestionAndDashboard({
    questionDetails,
  }).then(({ body: { id, card_id, dashboard_id } }) => {
    cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
      dashcards: [
        {
          id,
          card_id,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 6,
        },
      ],
    });

    H.visitDashboard(dashboard_id);

    cy.findByLabelText(/Edit dashboard|Ändere das Dashboard/).click();

    cy.icon("filter").click();
    H.popover()
      .findByText(/Text or Category|Text oder Kategorie/)
      .click();

    H.getDashboardCard()
      .findByText(/Select|Wähle/)
      .click();
  });
};

export const getCSVWithHeaderRow = (dictionary: DictionaryArray) => {
  const header = ["Language", "String", "Translation"];
  return [header, ...dictionary]
    .map((row) => Object.values(row).join(","))
    .join("\n");
};

export const uploadTranslationDictionary = (rows: DictionaryArray) => {
  interceptContentTranslationRoutes();
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

export const interceptContentTranslationRoutes = () => {
  cy.intercept("POST", "/api/ee/content-translation/upload-dictionary").as(
    "uploadDictionary",
  );
};
