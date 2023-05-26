import { restore, modal, filterWidget } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS } = SAMPLE_DATABASE;

const ORIGINAL_QUERY = "SELECT * FROM ORDERS WHERE {{filter}} LIMIT 2";

const filter = {
  id: "a3b95feb-b6d2-33b6-660b-bb656f59b1d7",
  name: "filter",
  "display-name": "Filter",
  type: "dimension",
  dimension: ["field", ORDERS.CREATED_AT, null],
  "widget-type": "date/month-year",
  default: null,
};

const nativeQuery = {
  name: "12581",
  native: {
    query: ORIGINAL_QUERY,
    "template-tags": {
      filter,
    },
  },
};

describe("issue 12581", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(nativeQuery, { visitQuestion: true });
  });

  it("should correctly display a revision state after a restore (metabase#12581)", () => {
    // Start with the original version of the question made with API
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open Editor/i).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open Editor/i).should("not.exist");

    // Both delay and a repeated sequence of `{selectall}{backspace}` are there to prevent typing flakes
    // Without them at least 1 in 10 test runs locally didn't fully clear the field or type correctly
    cy.get(".ace_content")
      .as("editor")
      .click()
      .type("{selectall}{backspace}", { delay: 50 });
    cy.get("@editor").click().type("{selectall}{backspace}SELECT 1");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    modal().within(() => {
      cy.button("Save").click();
    });

    cy.reload();
    cy.wait("@cardQuery");

    cy.findByTestId("revision-history-button").click();
    // Make sure sidebar opened and the history loaded
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/You created this/i);

    cy.findByTestId("question-revert-button").click(); // Revert to the first revision
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/You reverted to an earlier version/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open Editor/i).click();

    cy.log("Reported failing on v0.35.3");
    cy.get("@editor").should("be.visible").and("contain", ORIGINAL_QUERY);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("37.65");

    // Filter dropdown field
    filterWidget().contains("Filter");
  });
});
