import { restore, setActionsEnabledForDB } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

describe("scenarios > actions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("passes", () => {
    setActionsEnabledForDB(SAMPLE_DB_ID);
    cy.visit("/");
  });
});
