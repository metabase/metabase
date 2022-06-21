import { popover, restore } from "__support__/e2e/cypress";

const DASHBOARD_ITEM_NAME = "Orders in a dashboard";
const CARD_ITEM_NAME = "Orders, Count";
const MODE_ITEM_NAME = "Orders";

describe("scenarios > collection pinned items overview", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", `/api/card/*/query`).as("getCardQuery");
    cy.intercept("GET", "/api/collection/*/items?pinned_state=is_pinned*").as(
      "getPinnedItems",
    );
  });

  it("should be able to pin a dashboard", () => {
    cy.visit("/collection/root");
    cy.wait("@getPinnedItems");

    openUnpinnedItemMenu(DASHBOARD_ITEM_NAME);
    popover().within(() => cy.findByText("Pin this").click());
    cy.wait("@getPinnedItems");

    // ensure the dashboard card is showing in the pinned section
    getPinnedSection().within(() => {
      cy.icon("dashboard").should("be.visible");
      cy.findByText("A dashboard").should("be.visible");
      cy.findByText(DASHBOARD_ITEM_NAME).click();
      cy.url().should("include", "/dashboard/1");
    });
  });

  it("should be able to pin a question", () => {
    cy.visit("/collection/root");
    cy.wait("@getPinnedItems");

    openUnpinnedItemMenu(CARD_ITEM_NAME);
    popover().within(() => cy.findByText("Pin this").click());
    cy.wait(["@getPinnedItems", "@getCardQuery"]);

    getPinnedSection().within(() => {
      cy.findByText("18,760").should("be.visible");
      cy.findByText(CARD_ITEM_NAME).click();
      cy.url().should("include", "/question/2");
    });
  });

  it("should be able to pin a model", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.visit("/collection/root");
    cy.wait("@getPinnedItems");

    openUnpinnedItemMenu(MODE_ITEM_NAME);
    popover().within(() => cy.findByText("Pin this").click());
    cy.wait("@getPinnedItems");

    getPinnedSection().within(() => {
      cy.icon("model").should("be.visible");
      cy.findByText(MODE_ITEM_NAME).should("be.visible");
      cy.findByText("A model").click();
      cy.url().should("include", "/model/1");
    });
  });

  it("should be able to unpin a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });
    cy.visit("/collection/root");
    cy.wait("@getPinnedItems");

    openPinnedItemMenu(DASHBOARD_ITEM_NAME);
    popover().within(() => cy.findByText("Unpin").click());
    cy.wait("@getPinnedItems");

    getPinnedSection().should("not.exist");
  });

  it("should be able to move a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });
    cy.visit("/collection/root");
    cy.wait("@getPinnedItems");

    openPinnedItemMenu(DASHBOARD_ITEM_NAME);
    popover().within(() => cy.findByText("Move").click());

    cy.findByText(`Move "${DASHBOARD_ITEM_NAME}"?`).should("be.visible");
  });

  it("should be able to duplicate a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });
    cy.visit("/collection/root");
    cy.wait("@getPinnedItems");

    openPinnedItemMenu(DASHBOARD_ITEM_NAME);
    popover().within(() => cy.findByText("Duplicate").click());

    cy.findByText(`Duplicate "${DASHBOARD_ITEM_NAME}"`).should("be.visible");
  });

  it("should be able to archive a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });
    cy.visit("/collection/root");
    cy.wait("@getPinnedItems");

    openPinnedItemMenu(DASHBOARD_ITEM_NAME);
    popover().within(() => cy.findByText("Archive").click());
    cy.wait("@getPinnedItems");

    getPinnedSection().should("not.exist");
    cy.findByText(DASHBOARD_ITEM_NAME).should("not.exist");
  });
});

const getPinnedSection = () => {
  return cy.findByTestId("pinned-items");
};

const getUnpinnedSection = () => {
  return cy.findByRole("table");
};

const openPinnedItemMenu = name => {
  getPinnedSection().within(() => {
    cy.findByText(name)
      .closest("a")
      .within(() => cy.icon("ellipsis").click({ force: true }));
  });
};

const openUnpinnedItemMenu = name => {
  getUnpinnedSection().within(() => {
    cy.findByText(name)
      .closest("tr")
      .within(() => cy.icon("ellipsis").click());
  });
};
