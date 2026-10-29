const { H } = cy;

describe("scenarios > question > relative-datetime", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("starting from option should set correct sign (metabase#22228)", () => {
    H.openOrdersTable();

    H.tableHeaderClick("Created At");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Relative date range…").click();
      cy.findByText("Next").click();
      cy.findByLabelText(/Starting from/).click();
      cy.button("Add filter").click();
    });
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").within(() => {
      const baseName = "Created At is in the next 30 days";
      cy.findByText(`${baseName}, starting 7 days from now`).should(
        "be.visible",
      );
      cy.findByText(`${baseName}, starting 7 days ago`).should("not.exist");
    });
  });
});
