const { H } = cy;

describe("scenarios > admin > help > helping hand", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-cloud");
  });

  it("should create an access grant, allow only one active grant, and revoke it", () => {
    cy.visit("/admin/help");

    cy.findByTestId("admin-navbar").findByText("Metabase Admin");
    cy.findByRole("heading", { name: "Helping hand" }).should("be.visible");
    cy.findByTestId("access-grant-list-table").should("not.exist");

    cy.button("Request a helping hand").should("be.enabled").click();
    cy.findByTestId("grant-access-modal").within(() => {
      cy.findByLabelText(/Access duration/).click();
      cy.document().findByRole("listbox").findByText("48 hours").click();
      cy.findByLabelText("Ticket").type("TICKET-999");
      cy.findByLabelText("Notes").type("Custom notes");
      cy.button("Grant access").click();
    });
    H.undoToast()
      .findByText("Access grant created successfully")
      .should("be.visible");

    cy.log("the grant is stored and blocks a second one after a reload");
    cy.reload();
    cy.findByTestId("access-grant-list-table").within(() => {
      cy.get("tbody").findAllByRole("row").should("have.length", 1);
      cy.findByRole("cell", { name: "TICKET-999" }).should("be.visible");
      cy.findByRole("cell", { name: "Custom notes" }).should("be.visible");
      cy.findByText("48 hours left").should("be.visible");
    });
    cy.button("Request a helping hand").should("be.disabled");

    cy.log("revoke the grant");
    cy.findByTestId("access-grant-list-table")
      .button("Revoke access grant")
      .click();
    H.modal().button("Revoke").click();
    H.undoToast()
      .findByText("Access grant revoked successfully")
      .should("be.visible");

    cy.reload();
    cy.button("Request a helping hand").should("be.enabled");
    cy.findByTestId("access-grant-list-table")
      .button("Revoke access grant")
      .should("not.exist");
  });
});
