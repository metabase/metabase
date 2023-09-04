import { main, navigationSidebar, restore } from "e2e/support/helpers";

describe("issue 33637", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not show 'Download results' or 'Edit question' on cards on unsaved xray dashboards (metabase#33637)", () => {
    cy.visit("/");

    navigationSidebar().findByText("Browse data").click();

    main().findByText("Sample Database").click();

    openXrayFor("Orders");

    main()
      .findByText("Total transactions")
      .closest(`.DashCard`)
      .within(a => {
        cy.icon("hourglass").should("not.exist");

        cy.findByText("Total transactions").realHover();

        cy.findByTestId("dashcard-menu").should("not.exist");
      });
  });
});

function openXrayFor(name) {
  main().findByText(name).realHover().closest("a").icon("bolt_filled").click();
}
