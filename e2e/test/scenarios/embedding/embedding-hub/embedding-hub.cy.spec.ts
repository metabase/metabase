const { H } = cy;

describe("scenarios - embedding hub", () => {
  describe("checklist", () => {
    beforeEach(() => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("pro-cloud");
    });

    it("Contains setup guide in sidebar", () => {
      cy.visit("/admin/embedding");

      cy.findByTestId("admin-layout-sidebar")
        .findByText("Setup guide")
        .should("exist")
        .click();

      cy.findByTestId("admin-layout-content")
        .findByRole("heading", { name: "Embedding setup guide" })
        .should("exist");
    });

    it('"Generate a dashboard" card should work correctly', () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.log("Find and click on 'Generate a dashboard' card");
      cy.findByTestId("admin-layout-content")
        .findByText("Generate a dashboard")
        .click();

      cy.log("Select a table to generate dashboard from");
      H.modal().within(() => {
        cy.findByText("Choose a table to generate a dashboard").should(
          "be.visible",
        );

        cy.get("[data-testid='picker-item']").first().click();
      });

      cy.log("Should navigate to auto dashboard creation");
      cy.url().should("include", "/auto/dashboard/table/");
    });

    it('"Add data" card should work correctly', () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.log("Find and click on 'Add data' card");
      cy.findByTestId("admin-layout-content").findByText("Add data").click();

      cy.log("Add data modal should open");
      cy.findByRole("dialog").within(() => {
        cy.findByRole("heading", { name: "Add data" }).should("be.visible");
      });
    });

    it('"Create models" link should navigate correctly', () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.log("Find and click on 'Create models' link");
      cy.findByTestId("admin-layout-content")
        .findByText("Create models")
        .first()
        .click();

      cy.log("Should navigate to model creation page");
      cy.url().should("include", "/model/new");
    });
  });
});
