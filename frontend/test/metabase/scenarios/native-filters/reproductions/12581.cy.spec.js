import { restore, modal, filterWidget } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
    cy.findByText(/Open Editor/i).click();
    cy.findByText(/Open Editor/i).should("not.exist");

    // Both delay and a repeated sequence of `{selectall}{backspace}` are there to prevent typing flakes
    // Without them at least 1 in 10 test runs locally didn't fully clear the field or type correctly
    cy.get(".ace_content")
      .as("editor")
      .click()
      .type("{selectall}{backspace}", { delay: 50 });
    cy.get("@editor")
      .click()
      .type("{selectall}{backspace}SELECT 1");

    cy.findByText("Save").click();
    modal().within(() => {
      cy.button("Save").click();
    });

    cy.reload();
    cy.wait("@cardQuery");

    cy.findByTestId("revision-history-button").click();
    // Make sure sidebar opened and the history loaded
    cy.findByText("You created this");

    cy.button("Revert").click(); // Revert to the first revision
    cy.wait("@dataset");

    cy.findByText("You reverted to an earlier revision");
    cy.findByText(/Open Editor/i).click();

    cy.log("Reported failing on v0.35.3");
    cy.get("@editor")
      .should("be.visible")
      .and("contain", ORIGINAL_QUERY);

    cy.findByText("37.65");

    // Filter dropdown field
    filterWidget().contains("Filter");
  });
});
