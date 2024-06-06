import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { restore } from "e2e/support/helpers";

describe("issue 26470", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres_12");
    cy.signInAsAdmin();
    cy.request("POST", "/api/persist/enable");
  });

  it("Model Cache enable / disable button should update button text", () => {
    cy.clock(Date.now());
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    cy.button("Turn model persistence on").click();
    cy.button(/Done/).should("exist");
    cy.tick(6000);
    cy.button("Turn model persistence off").should("exist");
  });
});
