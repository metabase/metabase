import { restore } from "__support__/e2e/cypress";

describe("scenarios > dashboard > visualization options", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("column reordering should work (metabase#16229)", () => {
    cy.visit("/dashboard/1");
    cy.icon("pencil").click();
    cy.get(".Card").realHover();
    cy.icon("palette").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("ID")
        .closest(".cursor-grab")
        .trigger("mousedown", 0, 0, { force: true })
        .trigger("mousemove", 5, 5, { force: true })
        .trigger("mousemove", 0, 100, { force: true })
        .trigger("mouseup", 0, 100, { force: true });

      /**
       * When this issue gets fixed, it should be safe to uncomment the following assertion.
       * It currently doesn't work in UI at all, but Cypress somehow manages to move the "ID" column.
       * However, it leaves an empty column in its place (thus, making it impossible to use this assertion).
       */
      // cy.get(".cursor-grab")
      //   .as("sidebarColumns") // Out of all the columns in the sidebar...
      //   .first() // ...pick the fist one and make sure it's not "ID" anymore
      //   .should("contain", "User ID");
    });

    // The table preview should get updated immediately, reflecting the changes in columns ordering.
    cy.get(".Modal .cellData").first().contains("User ID");
  });
});
