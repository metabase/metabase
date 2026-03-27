const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  NORMAL_USER_ID,
  NO_DATA_PERSONAL_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("personal collections", () => {
  beforeEach(() => {
    H.restore();
  });

  describe("admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    /**
     * This reproduction is here only as a placeholder until a proper backend tests is added.
     *
     * Not entirely sure how this issue will be resolved!
     * Thus, test might not work as expected by that point.
     *
     * For example:
     *  1. FE might decide not to fetch the full collection tree on the home page or
     *  2. BE might alter this endpoint
     *
     * TODO:
     *  - When the solution for this problem is ready, either adjust the test or completely remove it!
     */

    it(
      "shouldn't get API response containing all other personal collections when visiting the home page (metabase#24330)",
      { tags: "@skip" },
      () => {
        cy.intercept("GET", "/api/collection/tree*").as("getCollections");

        cy.visit("/");

        cy.wait("@getCollections").then(({ response: { body } }) => {
          const personalCollections = body.filter(({ personal_owner_id }) => {
            return personal_owner_id !== null;
          });

          // Admin can only see their own personal collection, so this list should return only that
          // Loading all other users' personal collections can lead to performance issues!
          expect(personalCollections).to.have.lengthOf(1);
        });
      },
    );

    it("should see a link to other users' personal collections only if there are other users", () => {
      cy.intercept("GET", "/api/session/properties", (req) => {
        req.continue((res) => {
          res.body["active-users-count"] = 1;
          return res.body;
        });
      }).as("getSessionProperties");

      cy.visit("/");
      cy.wait("@getSessionProperties");

      H.navigationSidebar()
        .findByLabelText("Other users' personal collections")
        .should("not.exist");

      cy.intercept("GET", "/api/session/properties", (req) => {
        req.continue((res) => {
          res.body["active-users-count"] = 2;
          return res.body;
        });
      }).as("getSessionProperties");

      cy.reload();
      cy.wait("@getSessionProperties");

      H.navigationSidebar()
        .findByLabelText("Other users' personal collections")
        .should("be.visible");
    });

    it("should be able to view their own as well as other users' personal collections (including other admins)", () => {
      // Turn normal user into another admin
      cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, {
        is_superuser: true,
      });

      cy.visit("/collection/root");
      cy.findAllByRole("tree")
        .contains("Your personal collection")
        .should("be.visible");
      H.navigationSidebar()
        .findByLabelText("Other users' personal collections")
        .click();
      cy.location("pathname").should("eq", "/collection/users");
      cy.findByTestId("browsercrumbs").findByText(/All personal collections/i);
      Object.values(USERS).forEach((user) => {
        const FULL_NAME = `${user.first_name} ${user.last_name}`;
        cy.findByText(FULL_NAME);
      });
    });

    it("cannot edit details for personal collections nor change permissions for personal collections or sub-collections (metabase#8406)", () => {
      // Let's use the API to create a sub-collection "Foo" in admin's personal collection
      cy.request("POST", "/api/collection", {
        name: "Foo",
        parent_id: ADMIN_PERSONAL_COLLECTION_ID,
      });

      H.visitCollection(ADMIN_PERSONAL_COLLECTION_ID);

      cy.log(
        "Make sure it's not possible to edit personal collection's permissions",
      );
      H.getCollectionActions().within(() => {
        cy.icon("info").should("exist");
        cy.icon("ellipsis").should("not.exist");
      });

      // This leads to an infinite loop and a timeout in the CI
      // Please see: https://github.com/metabase/metabase/issues/21026#issuecomment-1094114700

      // Check that it's not possible to open permissions modal via URL for personal collection
      // cy.location().then(location => {
      //   cy.visit(`${location}/permissions`);
      //   modal().should("not.exist");
      //   cy.url().should("eq", String(location));
      // });

      // Go to the newly created sub-collection "Foo"
      H.navigationSidebar().findByText("Foo").click();
      cy.findByDisplayValue("Foo").should("be.enabled");

      cy.log(
        "Other menu options exist, but editing permissions is not possible",
      );
      H.openCollectionMenu();
      H.popover().within(() => {
        cy.findByText("Move to trash").should("be.visible");
        cy.findByText("Edit permissions").should("not.exist");
      });

      // Check that it's not possible to open permissions modal via URL for personal collection child
      // cy.location().then(location => {
      //   cy.visit(`${location}/permissions`);
      //   modal().should("not.exist");
      //   cy.url().should("eq", String(location));
      // });

      // Go to random user's personal collection
      H.visitCollection(NO_DATA_PERSONAL_COLLECTION_ID);

      H.getCollectionActions().within(() => {
        cy.icon("info").should("exist");
        cy.icon("ellipsis").should("not.exist");
      });
    });

    it("should be able view other users' personal sub-collections (metabase#15339)", () => {
      H.createCollection({
        name: "Foo",
        parent_id: NO_DATA_PERSONAL_COLLECTION_ID,
      });

      cy.visit(`/collection/${NO_DATA_PERSONAL_COLLECTION_ID}`);
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Foo");
    });
  });

  describe("all users", () => {
    Object.keys(USERS).forEach((user) => {
      describe(`${user} user`, () => {
        beforeEach(() => {
          cy.signIn(user);

          cy.visit("/collection/root");
          H.navigationSidebar().findByText("Your personal collection").click();

          // Create initial collection inside the personal collection and navigate to it
          addNewCollection("Foo");
          H.navigationSidebar().as("sidebar").findByText("Foo").click();
        });

        it("should be able to edit collection(s) inside personal collection", () => {
          // Create new collection inside previously added collection
          addNewCollection("Bar");
          cy.get("@sidebar").findByText("Bar").click();
          cy.findByPlaceholderText("Add title").type("1").blur();
          cy.findByPlaceholderText("Add description").type("ex-bar").blur();

          cy.get("@sidebar").findByText("Foo").click();
          cy.get("@sidebar").findByText("Bar1");

          cy.log(
            "should be able to archive collection(s) inside personal collection (metabase#15343)",
          );

          H.openCollectionMenu();
          H.popover().findByText("Move to trash").click();
          H.modal().button("Move to trash").click();
          cy.findByTestId("toast-undo").should("contain", "Trashed collection");
          cy.get("@sidebar").findByText("Foo").should("not.exist");
        });
      });
    });
  });
});

function addNewCollection(name) {
  H.startNewCollectionFromSidebar();
  cy.findByPlaceholderText("My new fantastic collection").type(name, {
    delay: 0,
  });

  cy.findByTestId("new-collection-modal").button("Create").click();
}
