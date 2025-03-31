import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { DictionaryArray } from "metabase/i18n/types";

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

export const getCSV = (dictionary: DictionaryArray) => {
  const header = ["Language", "String", "Translation"];
  return [header, ...dictionary]
    .map((row) => Object.values(row).join(","))
    .join("\n");
};
