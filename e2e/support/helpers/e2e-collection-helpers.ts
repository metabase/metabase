import {
  entityPickerModal,
  entityPickerModalLevel,
  getFullName,
  navigationSidebar,
  popover,
} from "e2e/support/helpers";
import type { CollectionId } from "metabase-types/api";

export function startNewCollectionFromSidebar() {
  return navigationSidebar()
    .findByLabelText("Create a new collection")
    .should("be.visible")
    .click();
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
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findByTestId("collection-table")
    .findAllByText(item)
    .eq(index)
    .closest("tr")
    .icon("ellipsis")
    .click();
}

export const getPinnedSection = () => {
  return cy.findByTestId("pinned-items");
};

export const getUnpinnedSection = () => {
  return cy.findByRole("table");
};

export const openPinnedItemMenu = (name: string) => {
  cy.log(`open pinned item menu: ${name}`);

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
  cy.intercept("GET", "/api/collection/*/items**").as("getCollectionItems");
  openCollectionMenu();
  popover().within(() => cy.findByText("Move").click());


  cy.wait(["@getCollectionItems", "@getCollectionItems"]);
  entityPickerModal().within(() => {
    cy.findByTestId("nested-item-picker").findByText(newParent).click();
    cy.button("Move").click();
  });

  entityPickerModal().should("not.exist");
};

export function pickEntity({
  path,
  select,
}: {
  path?: (string | RegExp)[];
  select?: boolean;
}) {
  if (path) {
    cy.findByTestId("nested-item-picker").within(() => {
      for (const [index, name] of path.entries()) {
        entityPickerModalLevel(index).findByText(name).click();
      }
    });
  }

  if (select) {
    cy.findByTestId("entity-picker-select-button").click();
  }
}
