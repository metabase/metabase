import {
  restore,
  signInAsAdmin,
  openOrdersTable,
  popover,
} from "__support__/cypress";

describe("scenarios > question > null", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  describe("aggregations with null values", () => {
    beforeEach(() => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");
    });

    it("summarize with null values (metabase#12585)", () => {
      openOrdersTable();
      cy.wait("@dataset");
      cy.contains("Summarize").click();
      cy.contains("Summarize by");
      cy.contains("Count of rows").click();
      cy.contains("Cumulative sum of").click();
      popover()
        .contains("Discount")
        .click();
      cy.contains("Created At").click();
      cy.contains("Cumulative sum of Discount by Created At: Month");
      cy.wait(["@dataset", "@dataset"]).then(xhrs => {
        expect(xhrs[0].status).to.equal(202);
        expect(xhrs[1].status).to.equal(202);
      });

      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );
    });
  });
});
