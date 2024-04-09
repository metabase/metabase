import {
  restore,
  popover,
  navigationSidebar,
  openNavigationSidebar,
  entityPickerModal,
} from "e2e/support/helpers";

const modelName = "Orders Model";
const personalCollectionName = "Bobby Tables's Personal Collection";

describe("issue 19737", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show moved model in the data picker without refreshing (metabase#19737)", () => {
    cy.visit("/collection/root");

    moveModel(modelName, personalCollectionName);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Moved model");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    popover().within(() => {
      cy.findByText("Models").click();
      cy.findByText("Your personal collection").click();
      cy.findByText(modelName);
    });
  });

  it("should not show duplicate models in the data picker after it's moved from a custom collection without refreshing (metabase#19737)", () => {
    // move "Orders Model" to "First collection"
    cy.visit("/collection/root");

    moveModel(modelName, "First collection");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Moved model");
    // Close the modal so the next time we move the model another model will always be shown
    cy.icon("close:visible").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    // Open question picker (this is crucial) so the collection list are loaded.
    popover().within(() => {
      cy.findByText("Models").click();
      cy.findByText("First collection").click();
      cy.findByText(modelName);
    });

    // Use back button to so the state is kept
    cy.go("back");

    // move "Orders Model" from a custom collection ("First collection") to another collection
    openNavigationSidebar();
    navigationSidebar().findByText("First collection").click();

    moveModel(modelName, personalCollectionName);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Moved model");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    popover().within(() => {
      cy.findByText("Models").click();
      cy.findByText("First collection").click();
      cy.findByText("Nothing here");
    });
  });
});

function moveModel(modelName, collectionName) {
  openEllipsisMenuFor(modelName);
  popover().findByText("Move").click();

  entityPickerModal().within(() => {
    cy.findByText(collectionName).click();
    cy.button("Move").click();
  });
}

function openEllipsisMenuFor(item) {
  cy.findByText(item).closest("tr").find(".Icon-ellipsis").click();
}
