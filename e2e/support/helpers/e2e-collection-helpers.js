import { getFullName, popover } from "e2e/support/helpers";

/**
 * Clicks the "+" icon on the collection page and selects one of the menu options
 * @param {"question" | "dashboard" | "collection"} type
 */
export function openNewCollectionItemFlowFor(type) {
  cy.findByText("New").click();
  popover().findByText(new RegExp(type, "i")).click();
}

export function getCollectionActions() {
  return cy.findByTestId("collection-menu");
}

export function openCollectionMenu() {
  getCollectionActions().within(() => cy.icon("ellipsis").click());
}

export function getSidebarSectionTitle(name) {
  return cy.findAllByRole("heading", { name });
}

export function getCollectionIdFromSlug(slug, callback) {
  cy.request("GET", "/api/collection").then(({ body }) => {
    // We need its ID to continue nesting below it
    const { id } = body.find(collection => collection.slug === slug);

    callback && callback(id);
  });
}

export function visitCollection(id) {
  const alias = `getCollection${id}Items`;

  cy.intercept("GET", `/api/collection/${id}/items?**`).as(alias);

  cy.visit(`/collection/${id}`);

  cy.wait([`@${alias}`, `@${alias}`]);
}

export function getPersonalCollectionName(user) {
  return `${getFullName(user)}'s Personal Collection`;
}

export function openCollectionItemMenu(item, index = 0) {
  cy.findAllByText(item)
    .eq(index)
    .closest("tr")
    .within(() => cy.icon("ellipsis").click());
}

export const getPinnedSection = () => {
  return cy.findByTestId("pinned-items");
};

export const getUnpinnedSection = () => {
  return cy.findByRole("table");
};

export const openPinnedItemMenu = name => {
  getPinnedSection().within(() => {
    cy.findByText(name)
      .closest("a")
      .within(() => cy.icon("ellipsis").click({ force: true }));
  });
};

export const openUnpinnedItemMenu = name => {
  getUnpinnedSection().within(() => {
    cy.findByText(name)
      .closest("tr")
      .within(() => cy.icon("ellipsis").click());
  });
};
