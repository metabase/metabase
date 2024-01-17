import {
  restore,
  navigationSidebar,
  popover,
  getFullName,
} from "e2e/support/helpers";
import { USERS, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  ORDERS_QUESTION_ID,
  ADMIN_PERSONAL_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/metadata/utils/saved-questions";

const { admin, normal } = USERS;

describe("URLs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("browse databases", () => {
    it(`should slugify database name when opening it from /browse"`, () => {
      cy.visit("/browse");
      cy.findByTextEnsureVisible("Sample Database").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sample Database");
      cy.location("pathname").should(
        "eq",
        `/browse/${SAMPLE_DB_ID}-sample-database`,
      );
    });

    [
      `/browse/${SAVED_QUESTIONS_VIRTUAL_DB_ID}`,
      `/browse/${SAVED_QUESTIONS_VIRTUAL_DB_ID}-saved-questions`,
    ].forEach(url => {
      it("should open 'Saved Questions' database correctly", () => {
        cy.visit(url);
        cy.findByTestId("browse-data");
        cy.location("pathname").should("eq", url);
      });
    });
  });

  describe("dashboards", () => {
    it("should slugify dashboard URLs", () => {
      cy.visit("/collection/root");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders in a dashboard").click();
      cy.location("pathname").should(
        "eq",
        `/dashboard/${ORDERS_DASHBOARD_ID}-orders-in-a-dashboard`,
      );
    });
  });

  describe("questions", () => {
    it("should slugify question URLs", () => {
      cy.visit("/collection/root");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders").click();
      cy.location("pathname").should(
        "eq",
        `/question/${ORDERS_QUESTION_ID}-orders`,
      );
    });
  });

  describe("collections", () => {
    it("should slugify collection name", () => {
      cy.visit("/collection/root");
      cy.findAllByTestId("collection-entry-name")
        .contains("First collection")
        .click();
      cy.location("pathname").should(
        "eq",
        `/collection/${FIRST_COLLECTION_ID}-first-collection`,
      );
    });

    it("should slugify current user's personal collection name correctly", () => {
      cy.visit("/collection/root");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Your personal collection").click();
      cy.location("pathname").should(
        "eq",
        `/collection/${ADMIN_PERSONAL_COLLECTION_ID}-${getUsersPersonalCollectionSlug(
          admin,
        )}`,
      );
    });

    it("should not slugify users' collections page URL", () => {
      cy.visit("/collection/root");
      navigationSidebar().within(() => {
        cy.icon("ellipsis").click();
      });
      popover().findByText("Other users' personal collections").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("All personal collections");
      cy.location("pathname").should("eq", "/collection/users");
    });

    it("should open slugified URLs correctly", () => {
      cy.visit(`/collection/${FIRST_COLLECTION_ID}-first-collection`);
      cy.findByTestId("collection-name-heading").should(
        "have.text",
        "First collection",
      );

      cy.visit(
        `/collection/${ADMIN_PERSONAL_COLLECTION_ID}-${getUsersPersonalCollectionSlug(
          admin,
        )}`,
      );
      cy.findByTestId("collection-name-heading").should(
        "have.text",
        `${getFullName(admin)}'s Personal Collection`,
      );

      cy.visit(
        `/collection/${NORMAL_PERSONAL_COLLECTION_ID}-${getUsersPersonalCollectionSlug(
          normal,
        )}`,
      );
      cy.findByTestId("collection-name-heading").should(
        "have.text",
        `${getFullName(normal)}'s Personal Collection`,
      );
    });
  });
});

function getUsersPersonalCollectionSlug(user) {
  const { first_name, last_name } = user;

  return `${first_name.toLowerCase()}-${last_name.toLowerCase()}-s-personal-collection`;
}
