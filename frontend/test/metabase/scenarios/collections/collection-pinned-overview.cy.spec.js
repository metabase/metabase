import { restore, popover } from "__support__/e2e/helpers";

const DASHBOARD_ITEM_NAME = "Orders in a dashboard";
const CARD_ITEM_NAME = "Orders, Count";
const MODE_ITEM_NAME = "Orders";

describe("scenarios > collection pinned items overview", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", `/api/card/*/query`).as("cardQuery");
    cy.intercept(
      "GET",
      "/api/collection/root/items?pinned_state=is_pinned*",
    ).as("pinnedItemsGET");
  });

  it("should let the user pin items", () => {
    // Turn question 1 into a model
    cy.request("PUT", "/api/card/1", { dataset: true });

    cy.visit("/collection/root");
    cy.wait("@pinnedItemsGET");

    // pin a dashboard
    cy.findByText(DASHBOARD_ITEM_NAME)
      .closest("tr")
      .within(() => {
        cy.icon("pin").click();
      });
    cy.wait("@pinnedItemsGET");

    // ensure the dashboard card is showing in the pinned section
    cy.findByTestId("pinned-items").within(() => {
      cy.icon("dashboard");
      cy.findByText("A dashboard");
      // click on the card to navigate to the dashboard
      cy.findByText(DASHBOARD_ITEM_NAME).click();
      cy.url().should("include", "/dashboard/1");
    });

    cy.visit("/collection/root");
    cy.wait("@pinnedItemsGET");

    // pin a card
    cy.findByText(CARD_ITEM_NAME)
      .closest("tr")
      .within(() => {
        cy.icon("pin").click();
      });
    cy.wait(["@pinnedItemsGET", "@cardQuery"]);

    // ensure the card visualization is showing in the pinned section
    cy.findByTestId("pinned-items").within(() => {
      cy.findByText("18,760");
      cy.findByText(CARD_ITEM_NAME).click();
      cy.url().should("include", "/question/2");
    });

    cy.visit("/collection/root");
    cy.wait(["@pinnedItemsGET", "@cardQuery"]);

    // pin a model
    cy.findByText(MODE_ITEM_NAME)
      .closest("tr")
      .within(() => {
        cy.icon("pin").click();
      });
    cy.wait("@pinnedItemsGET");
    // ensure the model card is showing in the pinned section
    cy.findByTestId("pinned-items").within(() => {
      cy.findByText(MODE_ITEM_NAME);
      cy.icon("model");
      cy.findByText("A model").click();
      cy.url().should("include", "/model/1");
    });
  });

  describe("pinned item actions", () => {
    beforeEach(() => {
      // pin a dashboard using the API
      cy.request("PUT", "/api/dashboard/1", {
        collection_position: 1,
      });

      cy.visit("/collection/root");
      cy.wait("@pinnedItemsGET");

      // open the action menu
      cy.findByTestId("pinned-items").within(() => {
        cy.icon("dashboard");
        // the menu icon is hidden until the user hovers their mouse over the card
        cy.icon("ellipsis").click({ force: true });
      });
    });

    it("should be able to unpin a pinned item", () => {
      popover().within(() => {
        cy.findByText("Unpin").click();
      });

      // verify that the item is no longer in the pinned section
      cy.wait("@pinnedItemsGET");
      cy.findByTestId("pinned-items").should("not.exist");
    });

    it("should be able to move a pinned item", () => {
      popover().within(() => {
        cy.findByText("Move").click();
      });

      // verify that the move modal is showing
      cy.findByText(`Move "${DASHBOARD_ITEM_NAME}"?`);
    });

    it("should be able to duplicate a pinned item", () => {
      popover().within(() => {
        cy.findByText("Duplicate").click();
      });

      // verify that the duplicate modal is showing
      cy.findByText(`Duplicate "${DASHBOARD_ITEM_NAME}"`);
    });

    it("should be able to archive a pinned item", () => {
      popover().within(() => {
        cy.findByText("Archive").click();
      });

      // verify that the item is no longer on the page
      cy.wait("@pinnedItemsGET");
      cy.findByTestId("pinned-items").should("not.exist");
      cy.findByText(DASHBOARD_ITEM_NAME).should("not.exist");
    });
  });
});
