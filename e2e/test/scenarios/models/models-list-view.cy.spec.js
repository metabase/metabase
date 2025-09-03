const { H } = cy;

describe("scenarios > models list view", () => {
  describe("basic scenarios", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
      cy.intercept("POST", "/api/dataset").as("dataset");

      H.createNativeQuestion(
        {
          name: "Native Model",
          type: "model",
          native: {
            query: "SELECT * FROM ORDERS LIMIT 5",
          },
        },
        { visitQuestion: true },
      );
    });

    it("should allow to change default view", () => {
      H.openQuestionActions();

      H.popover().findByTextEnsureVisible("Edit metadata").click();

      cy.log("Ensure Settings tab is present");
      cy.findByTestId("dataset-edit-bar").findByText("Settings").click();

      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Model Settings").should("be.visible");

        cy.findByText("List").click();
      });

      cy.log("Ensure List view is enabled");
      cy.findByTestId("list-view").should("be.visible");

      cy.findByTestId("dataset-edit-bar").button("Save changes").click();
      cy.wait("@dataset");

      cy.log("Display data as list after saving");
      cy.findByTestId("list-view").should("be.visible");
    });

    it("should allow to customize list view", () => {
      H.openQuestionActions();

      H.popover().findByTextEnsureVisible("Edit metadata").click();

      cy.log("Ensure Settings tab is present");
      cy.findByTestId("dataset-edit-bar").findByText("Settings").click();

      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Model Settings").should("be.visible");

        cy.findByText("List").click();
      });

      cy.log("List can be customized");
      cy.findByRole("button", { name: "Customize the List layout" }).click();

      cy.log(
        "Verify the configuration layout structure contains default columns selected",
      );

      // Alias the main elements for reuse
      cy.findByTestId("list-view-left-columns").as("leftColumns");
      cy.findByTestId("list-view-right-columns").as("rightColumns");
      cy.findByTestId("list-view-preview").as("listPreview");

      cy.get("@leftColumns")
        .should("be.visible")
        .within(() => {
          cy.findByText("ID").should("be.visible");
        });

      cy.get("@rightColumns").within(() => {
        cy.findByText("USER_ID").should("be.visible");
        cy.findByText("PRODUCT_ID").should("be.visible");
        cy.findByText("SUBTOTAL").should("be.visible");
        cy.findByText("TAX").should("be.visible");
      });

      cy.log("Verify that preview is displayed correctly");
      cy.get("@listPreview").should("be.visible");
      cy.get("@listPreview").within(() => {
        // Verify preview shows sample data values
        cy.findByRole("img").should("have.attr", "aria-label", "document icon");
        cy.findAllByText("1").should("have.length", 2);
        cy.findByText("14").should("be.visible");
        cy.findByText("37.65").should("be.visible");
        cy.findByText("2.07").should("be.visible");
      });

      cy.log("Add CREATED_AT column to left columns");
      cy.get("@leftColumns").within(() => {
        cy.get("input").type("CR");
      });

      // Verify dropdown shows only CREATED_AT option
      H.popover().within(() => {
        cy.findByText("CREATED_AT").should("be.visible");
        cy.get("[role='option']").should("have.length", 1);

        // Select the CREATED_AT option
        cy.findByText("CREATED_AT").click();
      });

      cy.log("Verify preview updates with CREATED_AT value");
      cy.get("@listPreview").within(() => {
        cy.findByText("February 11, 2025, 9:40 PM").should("be.visible");
      });

      cy.log("Remove TAX column");
      cy.get("@rightColumns").within(() => {
        cy.findByText("TAX").parent().find("button").click();
      });

      cy.log("Verify preview updates with TAX value");
      cy.get("@listPreview").within(() => {
        cy.findByText("2.07").should("not.exist");
      });

      cy.log("Update list item icon");
      cy.get("@listPreview").within(() => {
        cy.findByRole("img").should("have.attr", "aria-label", "document icon");
      });

      cy.findByTestId("list-view-icon").click();
      H.popover().within(() => {
        cy.findByText("Company").should("be.visible").click();
      });
      cy.get("@listPreview").within(() => {
        cy.findByRole("img").should("have.attr", "aria-label", "company icon");
      });

      cy.findByTestId("dataset-edit-bar").button("Save changes").click();
      cy.wait("@dataset");

      cy.log("Verify that custom column set is correct");
      cy.findByTestId("visualization-root").within(() => {
        cy.findByText("ID and CREATED_AT").should("be.visible");
        cy.findByText("USER_ID").should("be.visible");
        cy.findByText("PRODUCT_ID").should("be.visible");
        cy.findByText("SUBTOTAL").should("be.visible");
        cy.findByText("TAX").should("not.exist");

        cy.findAllByRole("img")
          .first()
          .should("have.attr", "aria-label", "company icon");
        cy.findByText("February 11, 2025, 9:40 PM").should("be.visible");
        cy.findByText("14").should("be.visible");
        cy.findByText("37.65").should("be.visible");
        cy.findByText("2.07").should("not.exist");
      });
    });

    it("should allow to filter and drag-n-drop columns", () => {
      H.openQuestionActions();

      H.popover().findByTextEnsureVisible("Edit metadata").click();

      cy.findByTestId("dataset-edit-bar").findByText("Settings").click();

      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("List").click();
      });

      cy.findByRole("button", { name: "Customize the List layout" }).click();

      // Alias the main elements for reuse
      cy.findByTestId("list-view-right-columns").as("rightColumns");
      cy.findByTestId("list-view-preview").as("listPreview");
      cy.findByTestId("sidebar-right").as("sidebarRight");

      cy.get("@rightColumns").within(() => {
        cy.get("input").type("{Backspace}{Backspace}");
      });

      cy.log(
        "Find a draggable element with 'SUBTOTAL' text in sidebarRight panel and drag it into @rightColumns input",
      );
      cy.get("@sidebarRight").within(() => {
        cy.findByText("SUBTOTAL").should("be.visible");
      });

      cy.get("@listPreview").within(() => {
        cy.findByText("37.65").should("not.exist");
      });

      cy.get("@sidebarRight").find("input").type("SUB");

      H.dragAndDropByElement(
        cy.get("@sidebarRight").findByText("SUBTOTAL"),
        cy.get("@rightColumns").find("input"),
        { dragend: false },
      );

      cy.log("Verify that drag was handled correctly");
      cy.get("@rightColumns").within(() => {
        cy.findByText("SUBTOTAL").should("be.visible");
      });
      cy.get("@sidebarRight").within(() => {
        cy.findByText("SUBTOTAL").should("not.exist");
        cy.findByText("No available columns").should("be.visible");
      });
      cy.get("@listPreview").within(() => {
        cy.findByText("37.65").should("be.visible");
      });
    });
  });

  describe("advanced scenarios", () => {
    it("should preserve list view after model duplication", () => {
      H.restore();
      cy.signInAsAdmin();
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
      cy.intercept("POST", "/api/dataset").as("dataset");

      H.createNativeQuestion(
        {
          name: "Native Model",
          type: "model",
          display: "list",
          native: {
            query: "SELECT * FROM ORDERS LIMIT 5",
          },
        },
        { visitQuestion: true },
      );
      H.openQuestionActions();

      // Going through full flow, because for some reason `display: list` is not preserved on BE.
      H.popover().findByTextEnsureVisible("Edit metadata").click();

      cy.findByTestId("dataset-edit-bar").findByText("Settings").click();

      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("List").click();
      });

      cy.findByTestId("dataset-edit-bar").button("Save changes").click();
      cy.wait("@dataset");

      cy.findByTestId("list-view").should("be.visible");

      H.openQuestionActions();

      H.popover().findByTextEnsureVisible("Duplicate").click();
      H.modal().findByTextEnsureVisible("Duplicate").click();
      cy.wait("@dataset");

      cy.log("Display data as list after duplication");
      cy.findByTestId("qb-header").within(() => {
        cy.findByText("Native Model - Duplicate").should("be.visible");
      });
      cy.findByTestId("list-view").should("be.visible");
    });

    it("should change list view to table when saved as question", () => {
      H.restore();
      cy.signInAsAdmin();
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
      cy.intercept("POST", "/api/dataset").as("dataset");

      H.createNativeQuestion(
        {
          name: "Native Model",
          type: "model",
          display: "list",
          native: {
            query: "SELECT * FROM ORDERS LIMIT 5",
          },
        },
        { visitQuestion: true },
      );
      H.openQuestionActions();

      // Going through full flow, because for some reason `display: list` is not preserved on BE.
      H.popover().findByTextEnsureVisible("Edit metadata").click();

      cy.findByTestId("dataset-edit-bar").findByText("Settings").click();

      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("List").click();
      });

      cy.findByTestId("dataset-edit-bar").button("Save changes").click();
      cy.wait("@dataset");

      cy.findByTestId("list-view").should("be.visible");

      H.openQuestionActions();

      H.popover()
        .findByTextEnsureVisible("Turn back to saved question")
        .click();
      cy.wait("@dataset");
      H.undoToast().should("contain.text", "This is a question now");
      cy.findByTestId("list-view").should("not.exist");
    });
  });
});
