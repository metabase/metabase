import {
  restore,
  showVisualizationOptions,
  getDashboardCard,
  popover,
  visitDashboard,
  createEmptyTextBox,
  addTextBox,
  createEmptyHeading,
  addHeading,
  editDashboard,
} from "e2e/support/helpers";

describe("scenarios > dashboard > text and headings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("text box and heading creation and popover", () => {
    beforeEach(() => {
      visitDashboard(1);
      editDashboard();
    });

    it("should have button and popover to create text and headings", () => {
      cy.icon("string").click();
      popover().within(() => {
        cy.findByText("Text").should("exist");
        cy.findByText("Heading").should("exist");
      });
    });

    it("should auto-focus text input on creation", () => {
      visitDashboard(1);
      createEmptyTextBox();
      cy.focused().should(
        "have.attr",
        "placeholder",
        "You can use Markdown here, and include variables {{like_this}}",
      );
    });

    it("should auto-focus heading input on creation", () => {
      visitDashboard(1);
      createEmptyHeading();
      cy.focused().should("have.attr", "placeholder", "Heading");
    });
  });

  describe("text", () => {
    describe("Editing", () => {
      beforeEach(() => {
        // Create text box card
        visitDashboard(1);
        addTextBox("Text *text* __text__");
      });

      it("should render visualization options (metabase#22061)", () => {
        showVisualizationOptions(1);

        cy.get(".Modal").within(() => {
          cy.findByText("Vertical Alignment");
          cy.findByText("Horizontal Alignment");
          cy.findByText("Show background");
        });
      });

      it("should not render edit and preview actions", () => {
        getDashboardCard(1)
          .realHover()
          .within(() => {
            cy.icon("edit_document").should("not.exist");
            cy.icon("eye").should("not.exist");
          });
      });

      it("should auto-edit on focus", () => {
        getDashboardCard(1)
          .realHover()
          .within(() => {
            cy.get("textarea").click();
          });
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("You're editing this dashboard.").realHover();

        getDashboardCard(1).within(() => {
          cy.get("textarea").should("have.value", "Text *text* __text__");
        });
      });

      it("should auto-edit on hover", () => {
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("You're editing this dashboard.").realHover().click();

        getDashboardCard(1)
          .realHover()
          .within(() => {
            cy.get("textarea").should("have.value", "Text *text* __text__");
          });
      });

      it("should auto-preview when not focused and not hovered", () => {
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("You're editing this dashboard.").realHover().click();

        getDashboardCard(1).within(() => {
          cy.get("div").contains("Text text text");
        });
      });
    });

    describe("when text-box is the only element on the dashboard", () => {
      beforeEach(() => {
        cy.createDashboard().then(({ body: { id } }) => {
          cy.intercept("PUT", `/api/dashboard/${id}`).as("dashboardUpdated");

          visitDashboard(id);
        });
      });

      // fixed in metabase#11358
      it("should load after save/refresh (metabase#12873)", () => {
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Test Dashboard");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("This dashboard is looking empty.");

        // Add save text box to dash
        addTextBox("Dashboard testing text");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Save").click();

        // Reload page
        cy.reload();

        // Page should still load
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("New");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Loading...").should("not.exist");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Cannot read property 'type' of undefined").should(
          "not.exist",
        );
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Test Dashboard");

        // Text box should still load
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Dashboard testing text");
      });

      it("should have a scroll bar for long text (metabase#8333)", () => {
        addTextBox(
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam ut fermentum erat, nec sagittis justo. Vivamus vitae ipsum semper, consectetur odio at, rutrum nisi. Fusce maximus consequat porta. Mauris libero mi, viverra ac hendrerit quis, rhoncus quis ante. Pellentesque molestie ut felis non congue. Vivamus finibus ligula id fringilla rutrum. Donec quis dignissim ligula, vitae tempor urna.\n\nDonec quis enim porta, porta lacus vel, maximus lacus. Sed iaculis leo tortor, vel tempor velit tempus vitae. Nulla facilisi. Vivamus quis sagittis magna. Aenean eu eros augue. Sed euismod pulvinar laoreet. Morbi commodo, sem sed dictum faucibus, sem ante ultrices libero, nec ornare risus lacus eget velit. Etiam sagittis lectus non erat tristique tempor. Sed in ipsum urna. Sed venenatis turpis at orci feugiat, ut gravida lectus luctus.",
          { delay: 0 },
        );
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Save").click();

        // The test fails if there is no scroll bar
        cy.get(".text-card-markdown")
          .should("have.css", "overflow-x", "hidden")
          .should("have.css", "overflow-y", "auto")
          .scrollTo("bottom");
      });
    });

    it("should let you add a parameter to a dashboard with a text box (metabase#11927)", () => {
      visitDashboard(1);
      addTextBox("text text text");
      cy.icon("filter").click();
      popover().within(() => {
        cy.findByText("Text or Category").click();
        cy.findByText("Is").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();

      // confirm text box and filter are still there
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("text text text");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Text");
    });
  });

  describe("heading", () => {
    describe("Editing", () => {
      beforeEach(() => {
        // Create text box card
        visitDashboard(1);
        addHeading("Example Heading");
      });

      it("should not render visualization options", () => {
        getDashboardCard(1)
          .realHover()
          .within(() => {
            cy.icon("palette").should("not.exist");
          });
      });

      it("should not render edit and preview actions", () => {
        getDashboardCard(1)
          .realHover()
          .within(() => {
            cy.icon("edit_document").should("not.exist");
            cy.icon("eye").should("not.exist");
          });
      });

      it("should auto-edit on focus", () => {
        getDashboardCard(1)
          .realHover()
          .within(() => {
            cy.get("input").click();
          });
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("You're editing this dashboard.").realHover();

        getDashboardCard(1).within(() => {
          cy.get("input").should("have.value", "Example Heading");
        });
      });

      it("should auto-edit on hover", () => {
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("You're editing this dashboard.").realHover().click();
        getDashboardCard(1)
          .realHover()
          .within(() => {
            cy.get("input").should("have.value", "Example Heading");
          });
      });

      it("should auto-preview when not focused and not hovered", () => {
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("You're editing this dashboard.").realHover().click();

        getDashboardCard(1).within(() => {
          cy.get("h2").contains("Example Heading");
        });
      });
    });
  });
});
