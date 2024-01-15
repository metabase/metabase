import { restore } from "e2e/support/helpers";
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

describe("issue 26470", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres_12");
    cy.signInAsAdmin();
    cy.request("POST", "/api/persist/enable");
  });

  it("Model Cache enable / disable button should update button text", () => {
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    cy.button("Turn model caching on").click();
    //Transition from Done takes 5 seconds, so this gives a 2 second buffer
    cy.button("Turn model caching off", { timeout: 7000 }).should("exist");
  });
});
