import { restore } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const MOCK_RESPONSE = {
  card: {
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "native",
      native: {
        query: "SELECT * FROM ORDERS LIMIT 1",
      },
    },
    display: "table",
    visualization_settings: {},
  },
  prompt_template_versions: [],
};

describe("scenarios > metabot", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", "/api/setting/is-metabot-enabled", { value: true });
    cy.intercept("POST", "/api/metabot/model/*", MOCK_RESPONSE);
    cy.intercept("POST", "/api/metabot/database/*", MOCK_RESPONSE);
  });

  it("should allow to ask questions from the home page", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.visit("/");
  });
});
