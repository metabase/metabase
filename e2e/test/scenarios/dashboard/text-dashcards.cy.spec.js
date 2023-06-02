import {
  restore,
  getDashboardCard,
  popover,
  visitDashboard,
  addTextBox,
  editDashboard,
  saveDashboard,
} from "e2e/support/helpers";

describe("scenarios > dashboard > text and headings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("text", () => {
    beforeEach(() => {
      visitDashboard(1);
    });

    it("should allow creation, editing, and saving of text boxes", () => {
      // should be able to create new text box
      editDashboard();
      cy.findByLabelText("Add a heading or text box").click();
      popover().findByText("Text").click();

      getDashboardCard(1).within(() => {
        // textarea should:
        //   1. be auto-focused on creation
        //   2. have no value
        //   3. have placeholder "You can use Markdown here, and include variables {{like_this}}"
        cy.get("textarea")
          .should("have.focus")
          .should("have.value", "")
          .should(
            "have.attr",
            "placeholder",
            "You can use Markdown here, and include variables {{like_this}}",
          );
      });

      // should auto-preview on blur (de-focus)
      cy.findByTestId("edit-bar")
        .findByText("You're editing this dashboard.")
        .click(); // un-focus text

      getDashboardCard(1).within(() => {
        // preview should have no textarea element
        cy.get("textarea").should("not.exist");

        // if no content has been entered, preview should have placeholder content
        cy.findByText(
          "You can use Markdown here, and include variables {{like_this}}",
        ).should("exist");
      });

      // should focus textarea editor on click
      getDashboardCard(1)
        .click()
        .within(() => {
          cy.get("textarea").should("have.focus");
        });

      // should be able to edit text while focused
      cy.focused().type("Text *text* __text__");

      // should auto-preview typed text
      cy.findByTestId("edit-bar")
        .findByText("You're editing this dashboard.")
        .click(); // un-focus text
      getDashboardCard(1).contains("Text text text").should("exist");

      // should render visualization options
      getDashboardCard(1)
        .realHover()
        .within(() => {
          cy.findByLabelText("Show visualization options").click();
        });

      cy.findByRole("dialog").within(() => {
        cy.findByTestId("chartsettings-sidebar").within(() => {
          cy.findByText("Vertical Alignment").should("exist");
          cy.findByText("Horizontal Alignment").should("exist");
          cy.findByText("Show background").should("exist");
        });

        cy.findByText("Cancel").click(); // dismiss modal
      });

      // should not render edit and preview actions
      getDashboardCard(1)
        .realHover()
        .within(() => {
          cy.findByLabelText("Edit card").should("not.exist");
          cy.findByLabelText("Preview card").should("not.exist");
        });

      // should allow saving and show up after refresh
      saveDashboard();

      getDashboardCard(1).contains("Text text text").should("exist");
    });

    it("should have a scroll bar for long text (metabase#8333)", () => {
      addTextBox(
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam ut fermentum erat, nec sagittis justo. Vivamus vitae ipsum semper, consectetur odio at, rutrum nisi. Fusce maximus consequat porta. Mauris libero mi, viverra ac hendrerit quis, rhoncus quis ante. Pellentesque molestie ut felis non congue. Vivamus finibus ligula id fringilla rutrum. Donec quis dignissim ligula, vitae tempor urna.\n\nDonec quis enim porta, porta lacus vel, maximus lacus. Sed iaculis leo tortor, vel tempor velit tempus vitae. Nulla facilisi. Vivamus quis sagittis magna. Aenean eu eros augue. Sed euismod pulvinar laoreet. Morbi commodo, sem sed dictum faucibus, sem ante ultrices libero, nec ornare risus lacus eget velit. Etiam sagittis lectus non erat tristique tempor. Sed in ipsum urna. Sed venenatis turpis at orci feugiat, ut gravida lectus luctus.",
        { delay: 1 },
      );
      cy.findByTestId("edit-bar").findByText("Save").click();

      // The test fails if there is no scroll bar
      getDashboardCard(1)
        .get(".text-card-markdown")
        .should("have.css", "overflow-x", "hidden")
        .should("have.css", "overflow-y", "auto")
        .scrollTo("bottom");
    });

    it("should let you add a parameter to a dashboard with a text box (metabase#11927)", () => {
      addTextBox("text text text");
      cy.findByLabelText("Add a filter").click();
      popover().within(() => {
        cy.findByText("Text or Category").click();
        cy.findByText("Is").click();
      });
      cy.findByTestId("edit-bar").findByText("Save").click();

      // confirm text box and filter are still there
      getDashboardCard(1).contains("text text text").should("exist");
      cy.findByTestId("dashboard-parameters-widget-container")
        .findByText("Text")
        .should("exist");
    });
  });

  describe("heading", () => {
    beforeEach(() => {
      visitDashboard(1);
    });

    it("should allow creation, editing, and saving of heading component", () => {
      // should be able to create new heading
      editDashboard();
      cy.findByLabelText("Add a heading or text box").click();
      popover().findByText("Heading").click();

      getDashboardCard(1).within(() => {
        // heading input should
        //   1. be auto-focused on creation
        //   2. have no value
        //   3. have placeholder "Heading"
        cy.get("input")
          .should("have.focus")
          .should("have.value", "")
          .should("have.attr", "placeholder", "Heading");
      });

      // should auto-preview on blur (de-focus)
      cy.findByTestId("edit-bar")
        .findByText("You're editing this dashboard.")
        .click(); // un-focus heading
      getDashboardCard(1).within(() => {
        // preview mode should have no input
        cy.get("input").should("not.exist");

        // if no content has been entered, preview should have placeholder "Heading"
        cy.get("h2").findByText("Heading").should("exist");
      });

      // should focus input editor on click
      getDashboardCard(1)
        .click()
        .within(() => {
          cy.get("input").should("have.focus");
        });

      // should be able to edit text while focused
      cy.focused().type("Example Heading");

      // should auto-preview typed text
      cy.findByTestId("edit-bar")
        .findByText("You're editing this dashboard.")
        .click(); // un-focus heading
      getDashboardCard(1)
        .get("h2")
        .findByText("Example Heading")
        .should("exist");

      // should have no visualization options
      getDashboardCard(1)
        .realHover()
        .within(() => {
          cy.findByLabelText("Show visualization options").should("not.exist");
        });

      // should not render edit and preview actions
      getDashboardCard(1)
        .realHover()
        .within(() => {
          cy.findByLabelText("Edit card").should("not.exist");
          cy.findByLabelText("Preview card").should("not.exist");
        });

      // should allow saving and show up after refresh
      saveDashboard();

      getDashboardCard(1)
        .get("h2")
        .findByText("Example Heading")
        .should("exist");
    });
  });
});
