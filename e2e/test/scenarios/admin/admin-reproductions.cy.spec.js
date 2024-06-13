import { WRITABLE_DB_ID, SAMPLE_DB_ID } from "e2e/support/cypress_data";
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

describe("issue 33035", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("GET", "/api/user/current").then(({ body: { id: user_id } }) => {
      cy.request("PUT", `/api/user/${user_id}`, { locale: "de" });
    });
  });

  it("databases page should work in a non-default locale (metabase#33035)", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    cy.findByRole("main").findByText("Orders").should("be.visible");
  });
});

describe("issue 21532", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow navigating back from admin settings (metabase#21532)", () => {
    cy.visit("/");

    cy.icon("gear").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Admin settings").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Getting set up");

    cy.go("back");
    cy.location().should(location => {
      expect(location.pathname).to.eq("/");
    });
  });
});
