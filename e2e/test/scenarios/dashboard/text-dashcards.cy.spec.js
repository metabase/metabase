import {
  restore,
  getDashboardCard,
  popover,
  visitDashboard,
  addTextBox,
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
      cy.findByLabelText("Edit dashboard").click();
      cy.findByLabelText("Add a heading or text box").click();
      popover().within(() => {
        cy.findByText("Text").click();
      });

      getDashboardCard(1).within(() => {
        // textarea should be auto-focused on creation
        cy.get("textarea").should("have.focus");

        // textarea editor should have placeholder "Heading"
        cy.get("textarea").should(
          "have.attr",
          "placeholder",
          "You can use Markdown here, and include variables {{like_this}}",
        );
      });

      // should auto-preview on blur (de-focus)
      cy.get("main").findByText("You're editing this dashboard.").click(); // un-focus heading
      getDashboardCard(1).within(() => {
        cy.get("div").should("exist");

        // if no content has been entered, preview should have placeholder content
        cy.get("div").contains(
          "You can use Markdown here, and include variables {{like_this}}",
        );
      });

      // should focus textarea editor on click
      getDashboardCard(1)
        .click()
        .within(() => {
          cy.get("textarea").should("have.focus").should("have.value", "");
        });

      // should be able to edit text while focused
      cy.focused().type("Text *text* __text__");

      // should auto-preview typed text
      cy.get("main").findByText("You're editing this dashboard.").click(); // un-focus heading
      getDashboardCard(1).within(() => {
        cy.get("div").contains("Text text text");
      });

      // should render visualization options
      getDashboardCard(1)
        .realHover()
        .within(() => {
          cy.findByLabelText("Show visualization options").click();
        });

      cy.get(".Modal").within(() => {
        cy.findByText("Vertical Alignment").should("exist");
        cy.findByText("Horizontal Alignment").should("exist");
        cy.findByText("Show background").should("exist");

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
      cy.get("main").findByText("Save").click();

      // Reload page
      cy.reload();

      getDashboardCard(1).within(() => {
        cy.get("div").contains("Text text text");
      });
    });

    it("should have a scroll bar for long text (metabase#8333)", () => {
      addTextBox(
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam ut fermentum erat, nec sagittis justo. Vivamus vitae ipsum semper, consectetur odio at, rutrum nisi. Fusce maximus consequat porta. Mauris libero mi, viverra ac hendrerit quis, rhoncus quis ante. Pellentesque molestie ut felis non congue. Vivamus finibus ligula id fringilla rutrum. Donec quis dignissim ligula, vitae tempor urna.\n\nDonec quis enim porta, porta lacus vel, maximus lacus. Sed iaculis leo tortor, vel tempor velit tempus vitae. Nulla facilisi. Vivamus quis sagittis magna. Aenean eu eros augue. Sed euismod pulvinar laoreet. Morbi commodo, sem sed dictum faucibus, sem ante ultrices libero, nec ornare risus lacus eget velit. Etiam sagittis lectus non erat tristique tempor. Sed in ipsum urna. Sed venenatis turpis at orci feugiat, ut gravida lectus luctus.",
        { delay: 1 },
      );
      cy.get("main").findByText("Save").click();

      // The test fails if there is no scroll bar
      cy.get(".text-card-markdown")
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
      cy.get("main").findByText("Save").click();

      // confirm text box and filter are still there
      cy.get("main").findByText("text text text");
      cy.get("main").findByText("Text");
    });
  });

  describe("heading", () => {
    beforeEach(() => {
      visitDashboard(1);
    });

    it("should allow creation, editing, and saving of heading component", () => {
      // should be able to create new heading
      cy.findByLabelText("Edit dashboard").click();
      cy.findByLabelText("Add a heading or text box").click();
      popover().within(() => {
        cy.findByText("Heading").click();
      });

      getDashboardCard(1).within(() => {
        // heading should be auto-focused on creation
        cy.get("input").should("have.focus");

        // input editor should have placeholder "Heading"
        cy.get("input").should("have.attr", "placeholder", "Heading");
      });

      // should auto-preview on blur (de-focus)
      cy.get("main").findByText("You're editing this dashboard.").click(); // un-focus heading
      getDashboardCard(1).within(() => {
        cy.get("h2").should("exist");

        // if no content has been entered, preview should have placeholder "Heading"
        cy.get("h2").contains("Heading");
      });

      // should focus input editor on click
      getDashboardCard(1)
        .click()
        .within(() => {
          cy.get("input").should("have.focus").should("have.value", "");
        });

      // should be able to edit text while focused
      cy.focused().type("Example Heading");

      // should auto-preview typed text
      cy.get("main").findByText("You're editing this dashboard.").click(); // un-focus heading
      getDashboardCard(1).within(() => {
        cy.get("h2").contains("Example Heading");
      });

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
      cy.get("main").findByText("Save").click();

      // Reload page
      cy.reload();

      getDashboardCard(1).within(() => {
        cy.get("h2").contains("Example Heading");
      });
    });
  });
});
