import { restore, sidebar } from "__support__/e2e/cypress";

describe("scenarios > collections > drag and drop functionality", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to drag an item to the root collection (metabase#16498)", () => {
    moveItemToCollection("Orders", "First collection");

    cy.visit("/collection/root");
    cy.findByText("First collection").click();

    cy.findByText("Orders").as("dragSubject");
    sidebar().findByText("Our analytics").as("dropTarget");

    dragAndDrop("dragSubject", "dropTarget");
    cy.findByText("Moved question");

    cy.visit("/collection/root");
    cy.findByText("Orders");
  });
});

function dragAndDrop(subjectAlias, targetAlias) {
  const dataTransfer = new DataTransfer();

  cy.get("@" + subjectAlias).trigger("dragstart", { dataTransfer });
  cy.get("@" + targetAlias).trigger("drop", { dataTransfer });
  cy.get("@" + subjectAlias).trigger("dragend");
}

function moveItemToCollection(itemName, collectionName) {
  cy.request("GET", "/api/collection/root/items").then(resp => {
    const ALL_ITEMS = resp.body.data;

    const { id, model } = getCollectionItem(ALL_ITEMS, itemName);
    const { id: collection_id } = getCollectionItem(ALL_ITEMS, collectionName);

    cy.request("PUT", `/api/${model}/${id}`, {
      collection_id,
    });
  });

  function getCollectionItem(collection, itemName) {
    return collection.find(item => item.name === itemName);
  }
}
