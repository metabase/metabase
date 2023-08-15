import {
  modal,
  openDashboardMenu,
  popover,
  restore,
  undoToast,
  visitDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Orders question",
  query: {
    "source-table": ORDERS_ID,
  },
};

describe("issue 25705", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      },
    );
  });

  it("should allow undo moving dashboard to another collection", () => {
    openDashboardMenu();

    popover().findByText("Move").click();

    const originalCollection = "Our analytics";
    const collectionToMoveTo = "First collection";
    cy.findByTestId("app-bar")
      .findByText(originalCollection)
      .should("be.visible");

    modal().within(() => {
      cy.findByText(collectionToMoveTo).click();
      cy.button("Move").click();
    });

    cy.findByTestId("app-bar").within(() => {
      cy.findByText(collectionToMoveTo).should("be.visible");
      cy.findByText(originalCollection).should("not.exist");
    });

    undoToast().button("Undo").click();
    cy.findByTestId("app-bar").findByText(originalCollection);
  });
});
