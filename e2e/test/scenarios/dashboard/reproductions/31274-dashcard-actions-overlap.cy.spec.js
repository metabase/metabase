import {
  editDashboard,
  restore,
  visitDashboard,
  getTextCardDetails,
} from "e2e/support/helpers";

const createTextCards = length => {
  return Array.from({ length }).map((_, index) => {
    return getTextCardDetails({
      size_x: 2,
      size_y: 2,
      row: (length - index - 1) * 2,
      text: `Text card ${index + 1}`,
    });
  });
};

describe("issue 31274", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // cypress automatically scrolls to the element, but we don't need it in this test
  it("should not clip dashcard actions (metabase#31274)", () => {
    cy.createDashboard().then(({ body: dashboard }) => {
      const dashcards = createTextCards(3);
      cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
        dashcards,
      });

      visitDashboard(dashboard.id);
      editDashboard(dashboard.id);

      secondTextCard().realHover();

      visibleActionsPanel().should("have.length", 1);

      cy.log(
        "Make sure cypress can click the element, which means it is not covered by another",
      );

      visibleActionsPanel().within(() => {
        cy.icon("close").click({
          position: "top",
        });
      });

      cy.findAllByTestId("dashcard").should("have.length", 2);
    });
  });

  it("renders cross icon on the link card without clipping", () => {
    cy.createDashboard().then(({ body: dashboard }) => {
      visitDashboard(dashboard.id);
      editDashboard(dashboard.id);
    });

    cy.icon("link").click();
    cy.findByPlaceholderText("https://example.com").realHover();

    cy.log(
      "Make sure cypress can click the element, which means it is not covered by another",
    );

    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("close").click({ position: "bottom" });
    });

    cy.findByTestId("dashcard").should("not.exist");
  });
});

function visibleActionsPanel() {
  return cy.findAllByTestId("dashboardcard-actions-panel").filter(":visible");
}

function secondTextCard() {
  return cy.findAllByTestId("editing-dashboard-text-preview").eq(1).parent();
}
