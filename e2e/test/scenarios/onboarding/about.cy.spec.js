const { H } = cy;

describe("scenarios > about Metabase", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.visit("/");
    cy.icon("gear").click();
    H.popover().findByText("About Metabase").click();
  });

  it(
    "should display correct Metabase version (metabase#15656)",
    { tags: "@skip" },
    () => {
      H.modal().within(() => {
        cy.findByText(/You're on version v[01](\.\d+){2,3}(-[\w\d]+)?/i);
        cy.findByText(/Built on \d{4}-\d{2}-\d{2}/);
        cy.findByText("Branch: ?").should("not.exist");
        cy.findByText("Hash: ?").should("not.exist");
      });
    },
  );
});
