import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, popover, tableHeaderClick } from "e2e/support/helpers";

const { REVIEWS, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("filter bug reproductions", () => {
  const questionDetails = {
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PEOPLE_ID,
    },
    type: "query",
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not crash when searching large field values sets in filters popover (metabase#32985)", () => {
    // we need to mess with the field metadata to make the field values crazy
    cy.request("PUT", `/api/field/${REVIEWS.REVIEWER}`, {
      semantic_type: "type/PK",
    });
    cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
      semantic_type: "type/FK",
    });
    cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
      fk_target_field_id: REVIEWS.REVIEWER,
    });

    cy.createQuestion(questionDetails, { visitQuestion: true });

    tableHeaderClick("Email");

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search by Email").type("foo");
    });
  });
});
