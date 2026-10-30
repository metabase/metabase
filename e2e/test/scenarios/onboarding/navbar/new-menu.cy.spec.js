const { H } = cy;

describe("metabase > scenarios > navbar > new menu", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.visit("/");
    H.navigationSidebar().should("be.visible");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
  });

  it("should open the question notebook and SQL query editors and close the navbar", () => {
    H.popover().within(() => {
      cy.findByText("Question").click();
    });

    cy.location("pathname").should("eq", "/question/notebook");
    H.miniPicker().should("be.visible");
    H.navigationSidebar().should("not.be.visible");

    cy.visit("/");
    H.navigationSidebar().should("be.visible");
    H.newButton().click();
    H.popover().within(() => {
      cy.findByText("SQL query").click();
    });

    cy.location("pathname").should("eq", "/question");
    H.NativeEditor.get().should("be.visible");
    H.navigationSidebar().should("not.be.visible");
  });
});

describe("metabase > scenarios > navbar > new menu tracking", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should track opening, closing, and selecting items from both New menus", () => {
    cy.visit("/");
    H.newButton().should("be.visible").click();
    cy.findByRole("menu", { name: /new/i }).should("be.visible");
    H.expectUnstructuredSnowplowEvent({
      event: "new_button_clicked",
      triggered_from: "app-bar",
    });

    H.newButton().click();
    cy.findByRole("menu", { name: /new/i }).should("not.exist");
    H.expectUnstructuredSnowplowEvent(
      { event: "new_button_clicked", triggered_from: "app-bar" },
      2,
    );

    H.newButton().click();
    cy.findByRole("menu", { name: /new/i }).findByText("Dashboard").click();
    cy.findByTestId("new-dashboard-modal").should("be.visible");
    H.expectUnstructuredSnowplowEvent({
      event: "new_button_item_clicked",
      triggered_from: "dashboard",
    });
    cy.findByTestId("new-dashboard-modal").button("Cancel").click();
    cy.findByTestId("new-dashboard-modal").should("not.exist");

    H.navigationSidebar().findByText("Your personal collection").click();
    cy.findByTestId("collection-empty-state").within(() => {
      cy.findByText("This collection is empty").should("be.visible");
      cy.findByText("New").click();
    });
    cy.findByRole("menu", { name: /new/i }).should("be.visible");
    H.expectUnstructuredSnowplowEvent({
      event: "new_button_clicked",
      triggered_from: "empty-collection",
    });
    cy.findByRole("menu", { name: /new/i }).findByText("Dashboard").click();
    cy.findByTestId("new-dashboard-modal").should("be.visible");
    H.expectUnstructuredSnowplowEvent(
      { event: "new_button_item_clicked", triggered_from: "dashboard" },
      2,
    );
  });
});
