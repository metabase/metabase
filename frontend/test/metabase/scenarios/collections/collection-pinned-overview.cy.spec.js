import { popover, restore } from "__support__/e2e/cypress";

const DASHBOARD_ITEM_NAME = "Orders in a dashboard";
const CARD_ITEM_NAME = "Orders, Count";
const MODE_ITEM_NAME = "Orders";

describe("scenarios > collection pinned items overview", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", `/api/card/*/query`).as("getCardQuery");
    cy.intercept(
      "GET",
      "/api/collection/root/items?pinned_state=is_pinned*",
    ).as("getPinnedItems");
  });

  describe("pinning items", () => {
    it("should pin a dashboard", () => {
      cy.visit("/collection/root");
      cy.wait("@getPinnedItems");

      pinItem(DASHBOARD_ITEM_NAME);
      cy.wait("@getPinnedItems");

      // ensure the dashboard card is showing in the pinned section
      cy.findByTestId("pinned-items").within(() => {
        cy.icon("dashboard").should("be.visible");
        cy.findByText("A dashboard").should("be.visible");
        cy.findByText(DASHBOARD_ITEM_NAME).click();
        cy.url().should("include", "/dashboard/1");
      });
    });

    it("should pin a question", () => {
      cy.visit("/collection/root");
      cy.wait("@getPinnedItems");

      pinItem(CARD_ITEM_NAME);
      cy.wait(["@getPinnedItems", "@getCardQuery"]);

      cy.findByTestId("pinned-items").within(() => {
        cy.findByText("18,760").should("be.visible");
        cy.findByText(CARD_ITEM_NAME).click();
        cy.url().should("include", "/question/2");
      });
    });

    it("should pin a model", () => {
      cy.request("PUT", "/api/card/1", { dataset: true });
      cy.visit("/collection/root");
      cy.wait("@getPinnedItems");

      pinItem(MODE_ITEM_NAME);
      cy.wait("@getPinnedItems");

      cy.findByTestId("pinned-items").within(() => {
        cy.icon("model").should("be.visible");
        cy.findByText(MODE_ITEM_NAME).should("be.visible");
        cy.findByText("A model").click();
        cy.url().should("include", "/model/1");
      });
    });
  });

  describe("pinned item actions", () => {
    beforeEach(() => {
      cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });

      cy.visit("/collection/root");
      cy.wait("@getPinnedItems");

      cy.findByTestId("pinned-items").within(() => {
        cy.icon("dashboard");
        cy.icon("ellipsis").click({ force: true });
      });
    });

    it("should be able to unpin a pinned item", () => {
      popover().within(() => {
        cy.findByText("Unpin").click();
        cy.wait("@getPinnedItems");
      });

      cy.findByTestId("pinned-items").should("not.exist");
    });

    it("should be able to move a pinned item", () => {
      popover().within(() => {
        cy.findByText("Move").click();
      });

      cy.findByText(`Move "${DASHBOARD_ITEM_NAME}"?`);
    });

    it("should be able to duplicate a pinned item", () => {
      popover().within(() => {
        cy.findByText("Duplicate").click();
      });

      cy.findByText(`Duplicate "${DASHBOARD_ITEM_NAME}"`);
    });

    it("should be able to archive a pinned item", () => {
      popover().within(() => {
        cy.findByText("Archive").click();
        cy.wait("@getPinnedItems");
      });

      cy.findByTestId("pinned-items").should("not.exist");
      cy.findByText(DASHBOARD_ITEM_NAME).should("not.exist");
    });
  });
});

const pinItem = name => {
  cy.findByText(name)
    .closest("tr")
    .within(() => cy.icon("ellipsis").click());

  popover().within(() => cy.icon("pin").click());
};
