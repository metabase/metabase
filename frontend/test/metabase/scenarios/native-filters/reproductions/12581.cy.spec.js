import { restore, modal, filterWidget } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS } = SAMPLE_DATASET;

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
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(nativeQuery).then(({ body }) => {
      cy.visit(`/question/${body.id}`);
    });
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
      .type("{selectall}{backspace}SELECT * FROM ORDERS");

    cy.findByText("Save").click();
    modal().within(() => {
      cy.button("Save").click();
    });

    cy.reload();

    cy.icon("pencil").click();
    cy.findByText(/View revision history/i).click();
    cy.findByText(/Revert/i).click(); // Revert to the first revision
    cy.findByText(/Open Editor/i).click();

    cy.log("Reported failing on v0.35.3");
    cy.get("@editor")
      .should("be.visible")
      .contains(ORIGINAL_QUERY);
    // Filter dropdown field
    filterWidget().contains("Filter");
  });
});
