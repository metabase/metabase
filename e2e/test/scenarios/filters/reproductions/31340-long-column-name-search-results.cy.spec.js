import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  popover,
  restore,
  selectFilterOperator,
  tableHeaderClick,
} from "e2e/support/helpers";

const { PEOPLE_ID } = SAMPLE_DATABASE;

const LONG_COLUMN_NAME =
  "Some very very very very long column name that should have a line break";

describe("issue 31340", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept("GET", "/api/field/*/search/*").as("search");

    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PEOPLE_ID}`,
    );

    cy.findByTestId("column-PASSWORD")
      .findByDisplayValue("Password")
      .type(`{selectAll}${LONG_COLUMN_NAME}`)
      .blur();

    cy.wait("@fieldUpdate");

    cy.createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          limit: 2,
        },
      },
      { visitQuestion: true },
    );
  });

  it("should properly display long column names in filter options search results (metabase#31340)", () => {
    tableHeaderClick(LONG_COLUMN_NAME);

    popover().findByText("Filter by this column").click();
    selectFilterOperator("Is");
    popover().within(() => {
      cy.findByPlaceholderText(`Search by ${LONG_COLUMN_NAME}`).type(
        "nonexistingvalue",
      );
      cy.wait("@search");
    });
  });
});
