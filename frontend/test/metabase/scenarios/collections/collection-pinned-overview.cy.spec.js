import { popover, restore } from "__support__/e2e/cypress";

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";
const MODEL_NAME = "Orders";

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
    openRootCollection();
    openUnpinnedItemMenu(DASHBOARD_NAME);
    popover().within(() => cy.findByText("Pin this").click());
    cy.wait("@getPinnedItems");

    getPinnedSection().within(() => {
      cy.icon("dashboard").should("be.visible");
      cy.findByText("A dashboard").should("be.visible");
      cy.findByText(DASHBOARD_NAME).click();
      cy.url().should("include", "/dashboard/1");
    });
  });

  it("should be able to pin a question", () => {
    openRootCollection();
    openUnpinnedItemMenu(QUESTION_NAME);
    popover().within(() => cy.findByText("Pin this").click());
    cy.wait(["@getPinnedItems", "@getCardQuery"]);

    getPinnedSection().within(() => {
      cy.findByText("18,760").should("be.visible");
      cy.findByText(QUESTION_NAME).click();
      cy.url().should("include", "/question/2");
    });
  });

  it("should be able to pin a model", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });

    openRootCollection();
    openUnpinnedItemMenu(MODEL_NAME);
    popover().within(() => cy.findByText("Pin this").click());
    cy.wait("@getPinnedItems");

    getPinnedSection().within(() => {
      cy.icon("model").should("be.visible");
      cy.findByText(MODEL_NAME).should("be.visible");
      cy.findByText("A model").click();
      cy.url().should("include", "/model/1");
    });
  });

  it("should be able to unpin a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(DASHBOARD_NAME);
    popover().within(() => cy.findByText("Unpin").click());
    cy.wait("@getPinnedItems");

    getPinnedSection().should("not.exist");
  });

  it("should be able to move a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(DASHBOARD_NAME);
    popover().within(() => cy.findByText("Move").click());

    cy.findByText(`Move "${DASHBOARD_NAME}"?`).should("be.visible");
  });

  it("should be able to duplicate a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(DASHBOARD_NAME);
    popover().within(() => cy.findByText("Duplicate").click());

    cy.findByText(`Duplicate "${DASHBOARD_NAME}"`).should("be.visible");
  });

  it("should be able to archive a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(DASHBOARD_NAME);
    popover().within(() => cy.findByText("Archive").click());
    cy.wait("@getPinnedItems");

    getPinnedSection().should("not.exist");
    cy.findByText(DASHBOARD_NAME).should("not.exist");
  });

  it("should be able to hide the visualization for a pinned question", () => {
    cy.request("PUT", "/api/card/2", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(QUESTION_NAME);
    popover().within(() => cy.findByText("Don’t show visualization").click());
    cy.wait("@getPinnedItems");

    getPinnedSection().within(() => {
      cy.findByText("18,760").should("not.exist");
      cy.findByText(QUESTION_NAME).click();
      cy.url().should("include", "/question/2");
    });
  });

  it("should be able to show the visualization for a pinned question", () => {
    cy.request("PUT", "/api/card/2", {
      collection_position: 1,
      collection_preview: false,
    });

    openRootCollection();
    openPinnedItemMenu(QUESTION_NAME);
    popover().within(() => cy.findByText("Show visualization").click());
    cy.wait(["@getPinnedItems", "@getCardQuery"]);

    getPinnedSection().within(() => {
      cy.findByText(QUESTION_NAME).should("be.visible");
      cy.findByText("18,760").should("be.visible");
    });
  });
});

const getPinnedSection = () => {
  return cy.findByTestId("pinned-items");
};

const getUnpinnedSection = () => {
  return cy.findByRole("table");
};

const openRootCollection = () => {
  cy.visit("/collection/root");
  cy.wait("@getPinnedItems");
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
