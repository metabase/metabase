import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PEOPLE } = SAMPLE_DATASET;

const QUESTION_DATA = {
  name: "15460",
  dataset_query: {
    database: 1,
    native: {
      query: "SELECT * FROM PEOPLE WHERE {{source}} AND {{birthdate}}",
      "template-tags": {
        birthdate: {
          id: "08c5ea9d-1579-3503-37f1-cbe4d29e6a28",
          name: "birthdate",
          "display-name": "Birthdate",
          type: "dimension",
          dimension: ["field", PEOPLE.BIRTH_DATE, null],
          "widget-type": "date/all-options",
          default: "past30years",
        },
        source: {
          id: "37eb6fa2-3677-91d3-6be0-c5dd9113c672",
          name: "source",
          "display-name": "Source",
          type: "dimension",
          dimension: ["field", PEOPLE.SOURCE, null],
          "widget-type": "string/=",
          default: "Affiliate",
        },
      },
    },
    type: "native",
  },
};

const EXPECTED_QUERY_PARAMS = "?birthdate=past30years&source=Affiliate";

const saveAndShare = () => {
  cy.icon("share").click();
  cy.findByPlaceholderText("What is the name of your card?").type("name");
  cy.button("Save").click();
};

const enableSharing = () => {
  cy.findByText("Enable sharing")
    .parent()
    .find("a")
    .click();
};

const visitPublicURL = () => {
  // Ideally we would just find the first input
  // but unless we filter by value
  // Cypress finds an input before the copyable inputs are rendered
  cy.findByDisplayValue(/^http/)
    .invoke("val")
    .then(publicURL => {
      // Copied URL has no get params
      expect(publicURL).not.to.have.string(EXPECTED_QUERY_PARAMS);

      cy.visit(publicURL);
    });
};

describe("scenarios > question > public", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });
  });

  it("adds filters to url as get params (metabase#7120)", () => {
    visitQuestionAdhoc(QUESTION_DATA);

    saveAndShare();

    enableSharing();

    visitPublicURL();

    // On page load, query params are added
    cy.url().should("include", "/public/question");
    cy.url().should("include", EXPECTED_QUERY_PARAMS);
  });
});
