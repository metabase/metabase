import { restore } from "__support__/e2e/cypress";

describe("timelines", () => {
  beforeEach(() => {
    restore();
  });

  describe("as admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should create an event and a default timeline", () => {
      cy.visit("/collection/root");

      cy.findByLabelText("calendar icon").click();
      cy.findByText("Add an event").click();

      cy.findByLabelText("Event name").type("Release");
      cy.findByLabelText("Date").type("10/20/2020");
      cy.button("Create").click();

      cy.findByText("Our analytics events");
      cy.findByText("Release");
      cy.findByText("October 20, 2020");
      cy.findByText("star icon");
    });
  });
});
