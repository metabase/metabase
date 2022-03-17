import _ from "underscore";
import {
  restore,
  modal,
  popover,
  openOrdersTable,
  sidebar,
} from "__support__/e2e/cypress";
import { displaySidebarChildOf } from "./helpers/e2e-collections-sidebar.js";
import { USERS, USER_GROUPS } from "__support__/e2e/cypress_data";

const { nocollection } = USERS;
const { DATA_GROUP } = USER_GROUPS;

// Z because the api lists them alphabetically by name, so it makes it easier to check
const [admin, collection, sub_collection] = [
  {
    name: "Robert Tableton's Personal Collection",
    id: 1,
  },
  {
    name: "Z Collection",
    id: null, // TBD from a response body
  },
  {
    name: "ZZ Sub-Collection",
    id: null, // TBD from a response body
  },
];

describe("Collection related issues reproductions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it.only("can bookmark collection from its page", () => {
    cy.visit("/collection/1");
  });
});

function openEllipsisMenuFor(item) {
  cy.findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
}

function selectItemUsingCheckbox(item, icon = "table") {
  cy.findByText(item)
    .closest("tr")
    .within(() => {
      cy.icon(icon).trigger("mouseover");
      cy.findByRole("checkbox").click();
    });
}

function getSidebarCollectionChildrenFor(item) {
  return sidebar()
    .findByText(item)
    .closest("a")
    .parent()
    .parent();
}
