const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { createMockParameter } from "metabase-types/api/mocks";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > text and headings", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  describe("text", () => {
    beforeEach(() => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should allow creation, editing, and saving of text boxes", () => {
      // should be able to create new text box
      H.editDashboard();
      cy.findByLabelText("Add a heading or text box").click();
      H.popover().findByText("Text").click();

      H.expectUnstructuredSnowplowEvent({
        event: "new_text_card_created",
      });

      H.getDashboardCard(1).within(() => {
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

      H.getDashboardCard(1).within(() => {
        // preview should have no textarea element
        cy.get("textarea").should("not.exist");

        // if no content has been entered, preview should have placeholder content
        cy.findByText(
          "You can use Markdown here, and include variables {{like_this}}",
        ).should("be.visible");
      });

      // should focus textarea editor on click
      H.getDashboardCard(1)
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
      H.getDashboardCard(1).contains("Text text text").should("be.visible");

      // should render visualization options
      H.getDashboardCard(1)
        .realHover()
        .within(() => {
          cy.findByLabelText("Show visualization options").click();
        });

      // should not render visualizer option
      H.getDashboardCard(1)
        .realHover()
        .within(() => {
          cy.findByLabelText("Visualize another way").should("not.exist");
        });

      cy.findByRole("dialog").within(() => {
        cy.findByTestId("chartsettings-sidebar").within(() => {
          cy.findByText("Vertical Alignment").should("be.visible");
          cy.findByText("Horizontal Alignment").should("be.visible");
          cy.findByText("Show background").should("be.visible");
        });

        cy.findByText("Cancel").click(); // dismiss modal
      });

      // should not render edit and preview actions
      H.getDashboardCard(1)
        .realHover()
        .within(() => {
          cy.findByLabelText("Edit card").should("not.exist");
          cy.findByLabelText("Preview card").should("not.exist");
        });

      // should allow saving and show up after refresh
      H.saveDashboard();

      H.getDashboardCard(1).contains("Text text text").should("be.visible");
    });

    it("should have a scroll bar for long text (metabase#8333)", () => {
      H.addTextBox(
        "Lorem ipsum dolor sit amet,\n\nfoo\n\nbar\n\nbaz\n\nboo\n\nDonec quis enim porta.",
        { delay: 0.5 },
      );

      H.expectUnstructuredSnowplowEvent({
        event: "new_text_card_created",
      });

      cy.findByTestId("edit-bar").findByText("Save").click();

      // The test fails if there is no scroll bar
      H.getDashboardCard(1)
        .get(".text-card-markdown")
        .should("have.css", "overflow-x", "hidden")
        .should("have.css", "overflow-y", "auto")
        .scrollTo("bottom");
    });

    it("should let you add a parameter to a dashboard with a text box (metabase#11927)", () => {
      H.addTextBox("text text text");

      H.setFilter("Text or Category", "Is");

      H.selectDashboardFilter(cy.findAllByTestId("dashcard").first(), "Name");
      cy.findByTestId("edit-bar").findByText("Save").click();

      // confirm text box and filter are still there
      H.getDashboardCard(1).contains("text text text").should("be.visible");
      cy.findByTestId("dashboard-parameters-widget-container")
        .findByText("Text")
        .should("be.visible");
    });
  });

  describe("heading", () => {
    beforeEach(() => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should allow creation, editing, and saving of heading component", () => {
      // should be able to create new heading
      H.editDashboard();
      cy.findByLabelText("Add a heading or text box").click();
      H.popover().findByText("Heading").click();

      H.expectUnstructuredSnowplowEvent({
        event: "new_heading_card_created",
      });

      H.getDashboardCard(1).within(() => {
        cy.get("input")
          .should("have.focus")
          .should("have.value", "")
          .should(
            "have.attr",
            "placeholder",
            "You can connect widgets to {{variables}} in heading cards.",
          );
      });

      // should auto-preview on blur (de-focus)
      cy.findByTestId("edit-bar")
        .findByText("You're editing this dashboard.")
        .click(); // un-focus heading
      H.getDashboardCard(1).within(() => {
        // preview mode should have no input
        cy.get("input").should("not.exist");

        cy.get("h2")
          .findByText(
            "You can connect widgets to {{variables}} in heading cards.",
          )
          .should("be.visible");
      });

      // should focus input editor on click
      H.getDashboardCard(1)
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
      H.getDashboardCard(1)
        .get("h2")
        .findByText("Example Heading")
        .should("be.visible");

      // should have no visualization options
      H.getDashboardCard(1)
        .realHover()
        .within(() => {
          cy.findByLabelText("Show visualization options").should("not.exist");
        });

      // should not render edit and preview actions
      H.getDashboardCard(1)
        .realHover()
        .within(() => {
          cy.findByLabelText("Edit card").should("not.exist");
          cy.findByLabelText("Preview card").should("not.exist");
        });

      // should allow saving and show up after refresh
      H.saveDashboard();

      H.getDashboardCard(1)
        .get("h2")
        .findByText("Example Heading")
        .should("be.visible");
    });
  });
});

describe("scenarios > dashboard > parameters in text and heading cards", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
      H.visitDashboard(DASHBOARD_ID);
    });
  });

  it("should allow dashboard filters to be connected to tags in text cards", () => {
    H.editDashboard();

    H.addTextBoxWhileEditing("Variable: {{foo}}", {
      parseSpecialCharSequences: false,
    });
    H.addHeadingWhileEditing("Variable: {{foo}}", {
      parseSpecialCharSequences: false,
    });

    H.setFilter("Number", "Equal to", "Equal to");

    H.getDashboardCard(0).findByText("Select…").click();
    H.popover().findByText("foo").click();

    H.getDashboardCard(1).findByText("Select…").click();
    H.popover().findByText("foo").click();

    H.saveDashboard();

    H.filterWidget().click();
    H.dashboardParametersPopover().within(() =>
      H.fieldValuesCombobox().type("1"),
    );
    cy.button("Add filter").click();
    H.getDashboardCard(0).findByText("Variable: 1").should("exist");
    H.getDashboardCard(1).findByText("Variable: 1").should("exist");

    cy.findByTestId("dashboard-parameters-widget-container")
      .findByText("1")
      .click();
    H.dashboardParametersPopover().within(() => {
      H.fieldValuesCombobox().type("2");
      cy.button("Update filter").click();
    });
    H.getDashboardCard(0).findByText("Variable: 1 and 2").should("exist");
    H.getDashboardCard(1).findByText("Variable: 1 and 2").should("exist");

    H.editDashboard();

    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Equal to")
      .click();
    H.getDashboardCard(0).findByText("foo").should("exist");
    H.getDashboardCard(1).findByText("foo").should("exist");
  });

  it("should not transform text variables to plain text (metabase#31626)", () => {
    H.editDashboard();

    const textContent = "Variable: {{foo}}";
    H.addTextBoxWhileEditing(textContent, { parseSpecialCharSequences: false });
    H.addHeadingWhileEditing(textContent, { parseSpecialCharSequences: false });

    H.setFilter("Number", "Equal to");

    H.getDashboardCard(0).findByText("Select…").click();
    H.popover().findByText("foo").click();

    H.getDashboardCard(1).findByText("Select…").click();
    H.popover().findByText("foo").click();

    H.saveDashboard();

    H.filterWidget().click();
    cy.findByPlaceholderText("Enter a number").type("1{enter}");
    cy.button("Add filter").click();

    // view mode
    H.getDashboardCard(0).findByText("Variable: 1").should("be.visible");
    H.getDashboardCard(1).findByText("Variable: 1").should("be.visible");

    H.editDashboard();

    H.getDashboardCard(0).findByText(textContent).should("be.visible");
    H.getDashboardCard(1).findByText(textContent).should("be.visible");
  });

  it("should translate parameter values into the instance language", () => {
    // Set user locale to English explicitly so that we can change the site locale separately, without the user
    // locale following it (by default, user locale matches site locale)
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "en" });
    });
    H.updateSetting("site-locale", "fr");
    cy.reload();

    H.editDashboard();

    H.addTextBoxWhileEditing("Variable: {{foo}}", {
      parseSpecialCharSequences: false,
    });
    H.addHeadingWhileEditing("Variable: {{foo}}", {
      parseSpecialCharSequences: false,
    });
    H.setFilter("Date picker", "Relative Date");

    H.getDashboardCard(0).findByText("Select…").click();
    H.popover().findByText("foo").click();

    H.getDashboardCard(1).findByText("Select…").click();
    H.popover().findByText("foo").click();

    H.saveDashboard();

    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Today").click();
    });

    H.getDashboardCard(0).findByText("Variable: Aujourd'hui").should("exist");
    H.getDashboardCard(1).findByText("Variable: Aujourd'hui").should("exist");

    // Let's make sure the localization was reset back to the user locale by checking that specific text exists in
    // English on the homepage.
    cy.visit("/");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick up where you left off").should("exist");
  });

  it("should localize date parameters in the instance locale", () => {
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "en" });
    });
    H.updateSetting("site-locale", "fr");

    // Create dashboard with a single date parameter, and a single question
    H.createQuestionAndDashboard({
      questionDetails: { query: { "source-table": PRODUCTS_ID } },
    }).then(({ body: card }) => {
      const { dashboard_id } = card;
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        parameters: [
          createMockParameter({
            name: "Single Date",
            slug: "single_date",
            id: "ad1c877e",
            type: "date/single",
            sectionId: "date",
          }),
        ],
      });
      const updatedSize = {
        size_x: 11,
        size_y: 6,
      };
      H.editDashboardCard(card, updatedSize);
      H.visitDashboard(dashboard_id);

      H.editDashboard();

      // Create text card and connect parameter
      H.addTextBoxWhileEditing("Variable: {{foo}}", {
        parseSpecialCharSequences: false,
      });
      H.addHeadingWhileEditing("Variable: {{foo}}", {
        parseSpecialCharSequences: false,
      });

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Single Date")
        .click();

      H.getDashboardCard(0).findByText("Select…").click();
      H.popover().findByText("Created At").click();

      H.getDashboardCard(1).findByText("Select…").click();
      H.popover().findByText("foo").click();

      H.getDashboardCard(2).findByText("Select…").click();
      H.popover().findByText("foo").click();

      H.saveDashboard();

      cy.findByTestId("dashboard-parameters-widget-container")
        .findByText("Single Date")
        .click();
      H.popover().within(() => {
        cy.findByRole("textbox").click().clear().type("07/19/2023").blur();
        cy.button("Add filter").click();
      });

      // Question should be filtered appropriately
      H.getDashboardCard(0).within(() => {
        cy.findByText("Rustic Paper Wallet").should("exist");
        cy.findByText("Small Marble Shoes").should("not.exist");
      });

      // Parameter value in widget should use user localization (English)
      cy.findByTestId("dashboard-parameters-widget-container")
        .findByText("July 19, 2023")
        .should("exist");

      // Parameter value in dashboard should use site localization (French)
      H.getDashboardCard(1)
        .findByText("Variable: juillet 19, 2023")
        .should("exist");
      H.getDashboardCard(2)
        .findByText("Variable: juillet 19, 2023")
        .should("exist");
    });
  });
});
