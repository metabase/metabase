describe("Consistent Icon Sizing", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.signInAsAdmin();
  });

  it("should have consistent size across various components", () => {
    cy.visit("/browse/1");

    cy.get("[aria-label='More info']").as("infoIcons");

    cy.get("@infoIcons").should("have.length.gt", 0);

    cy.get("@infoIcons").then($icons => {
      const firstIconSize = $icons.first()[0].getBoundingClientRect();
      const expectedWidth = firstIconSize.width;
      const expectedHeight = firstIconSize.height;

      $icons.each((index, icon) => {
        const { width, height } = icon.getBoundingClientRect();
        expect(width).to.be.closeTo(expectedWidth, 1);
        expect(height).to.be.closeTo(expectedHeight, 1);
      });
    });

    cy.visit("/question/new");

    cy.get("[aria-label='More info']").as("queryBuilderIcons");

    cy.get("@queryBuilderIcons").should("have.length.gt", 0);

    cy.get("@queryBuilderIcons").then($icons => {
      const firstIconSize = $icons.first()[0].getBoundingClientRect();
      const expectedWidth = firstIconSize.width;
      const expectedHeight = firstIconSize.height;

      $icons.each((index, icon) => {
        const { width, height } = icon.getBoundingClientRect();
        expect(width).to.be.closeTo(expectedWidth, 1);
        expect(height).to.be.closeTo(expectedHeight, 1);
      });
    });
  });
});
