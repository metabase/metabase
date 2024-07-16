import {
  entityPickerModal,
  entityPickerModalLevel,
  entityPickerModalTab,
  getFullName,
  popover,
} from "e2e/support/helpers";
import type {
  Collection,
  CollectionId,
  RegularCollectionId,
} from "metabase-types/api";

export const createCollection = ({
  name,
  description = null,
  parent_id = null,
  authority_level = null,
}: {
  name: string;
  description?: string | null;
  parent_id?: RegularCollectionId | null;
  authority_level?: "official" | null;
}): Cypress.Chainable<Cypress.Response<Collection>> => {
  cy.log(`Create a collection: ${name}`);

  return cy.request("POST", "/api/collection", {
    name,
    description,
    parent_id,
    authority_level,
  });
};

export const archiveCollection = (id: CollectionId) => {
  cy.log(`Archiving a collection with id: ${id}`);

  return cy.request("PUT", `/api/collection/${id}`, {
    archived: true,
  });
};

/**
 * Clicks the "+" icon on the collection page and selects one of the menu options
 *
 * @deprecated Use newButton helper
 */
export function openNewCollectionItemFlowFor(
  type: "question" | "dashboard" | "collection",
) {
  cy.findByText("New").click();
  popover().findByText(new RegExp(type, "i")).click();
}

export function getCollectionActions() {
  return cy.findByTestId("collection-menu");
}

export function openCollectionMenu() {
  getCollectionActions().icon("ellipsis").click();
}

export function getSidebarSectionTitle(name: string | RegExp) {
  return cy.findAllByRole("heading", { name });
}

export function visitCollection(id: CollectionId) {
  const alias = `getCollection${id}Items`;

  cy.intercept("GET", `/api/collection/${id}/items?**`).as(alias);

  cy.visit(`/collection/${id}`);

  cy.wait([`@${alias}`, `@${alias}`]);
}

export function getPersonalCollectionName(
  user: Parameters<typeof getFullName>[0],
) {
  return `${getFullName(user)}'s Personal Collection`;
}

export function openCollectionItemMenu(item: string, index = 0) {
  cy.findAllByText(item).eq(index).closest("tr").icon("ellipsis").click();
}

export const getPinnedSection = () => {
  return cy.findByTestId("pinned-items");
};

export const getUnpinnedSection = () => {
  return cy.findByRole("table");
};

export const openPinnedItemMenu = (name: string) => {
  getPinnedSection().within(() => {
    cy.findByText(name)
      .closest("a")
      .realHover()
      .within(() => cy.findByLabelText("Actions").click());
  });
};

export const openUnpinnedItemMenu = (name: string) => {
  getUnpinnedSection().within(() => {
    cy.findByText(name).closest("tr").icon("ellipsis").click();
  });
};

export const moveOpenedCollectionTo = (newParent: string) => {
  openCollectionMenu();
  popover().within(() => cy.findByText("Move").click());

  entityPickerModal().within(() => {
    cy.findByRole("tab", { name: /Collections/ }).click();
    cy.findByText(newParent).click();
    cy.button("Move").click();
  });

  entityPickerModal().should("not.exist");
};

export function pickEntity({
  path,
  select,
  tab,
}: {
  path?: string[];
  select?: boolean;
  tab?: string;
}) {
  if (tab) {
    entityPickerModalTab(tab).click();
  }

  if (path) {
    cy.findByTestId("nested-item-picker").within(() => {
      for (const [index, name] of path.entries()) {
        entityPickerModalLevel(index).findByText(name).click();
      }
    });
  }

  if (select) {
    cy.findByTestId("entity-picker-modal").button("Select").click();
  }
}
