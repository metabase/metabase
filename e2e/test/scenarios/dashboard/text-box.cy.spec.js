import {
  restore,
  showDashboardCardActions,
  popover,
  visitDashboard,
  addTextBox,
} from "e2e/support/helpers";

describe("scenarios > dashboard > text-box", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("Editing", () => {
    beforeEach(() => {
      // Create text box card
      visitDashboard(1);
      addTextBox("Text *text* __text__");
    });

    it("should render correct icons for preview and edit modes", () => {
      showDashboardCardActions(1);

      // edit mode
      cy.icon("eye").click();

      // preview mode
      cy.icon("edit_document");
    });

    it("should render visualization options (metabase#22061)", () => {
      showDashboardCardActions(1);

      // edit mode
      cy.icon("palette").eq(1).click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Vertical Alignment");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Horizontal Alignment");
    });

    it("should not render edit and preview actions when not editing", () => {
      // Exit edit mode and check for edit options
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("You are editing a dashboard").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Text text text");
      cy.icon("edit_document").should("not.exist");
      cy.icon("eye").should("not.exist");
    });

    it("should switch between rendered markdown and textarea input", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Text *text* __text__");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Text text text");
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
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();

      cy.wait("@dashboardUpdated");

      // The test fails if there is no scroll bar
      cy.get(".text-card-markdown")
        .should("have.css", "overflow-x", "hidden")
        .should("have.css", "overflow-y", "auto")
        .scrollTo("bottom");
    });

    it("should render html links, and not just the markdown flavor of them (metabase#18114)", () => {
      addTextBox(
        "- Visit https://www.metabase.com{enter}- Or go to [Metabase](https://www.metabase.com)",
      );

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("You're editing this dashboard.").should("not.exist");

      cy.get(".Card")
        .findAllByRole("link")
        .should("be.visible")
        .and("have.length", 2);
    });
  });

  it("should let you add a parameter to a dashboard with a text box (metabase#11927)", () => {
    visitDashboard(1);
    // click pencil icon to edit
    cy.icon("pencil").click();
    // add text box with text
    cy.icon("string").click();
    cy.get(".DashCard").last().find("textarea").type("text text text");
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
