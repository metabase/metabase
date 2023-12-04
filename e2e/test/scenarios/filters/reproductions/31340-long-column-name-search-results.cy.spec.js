import {
  assertDescendantNotOverflowsContainer,
  assertIsEllipsified,
  popover,
  restore,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";

const { PEOPLE_ID } = SAMPLE_DATABASE;

const LONG_COLUMN_NAME =
  "Some very very very very long column name that should have a line break";

describe("issue 31340", function () {
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
    cy.findAllByTestId("header-cell").contains(LONG_COLUMN_NAME).click();

    popover().within(() => {
      cy.findByText("Filter by this column").click();

      cy.findByPlaceholderText(`Search by ${LONG_COLUMN_NAME}`).type(
        "nonexistingvalue",
      );

      cy.wait("@search");

      cy.contains(`No matching ${LONG_COLUMN_NAME} found.`)
        .should("be.visible")
        .then($container => {
          cy.findByText(LONG_COLUMN_NAME).then(([columnTextEl]) => {
            const containerEl = $container[0];

            // check that text block is not wider than the popover
            assertDescendantNotOverflowsContainer(
              containerEl,
              $container.parent()[0],
              "search results message",
            );

            // check that column name is within the text block
            assertDescendantNotOverflowsContainer(
              columnTextEl,
              containerEl,
              "search results message",
            );

            const lineHeight = parseFloat(
              window.getComputedStyle(columnTextEl).lineHeight,
            );
            // and it takes no more than 1 line
            expect(columnTextEl.getBoundingClientRect().height).to.be.lte(
              lineHeight,
            );

            assertIsEllipsified(columnTextEl);
          });
        });
    });
  });
});
