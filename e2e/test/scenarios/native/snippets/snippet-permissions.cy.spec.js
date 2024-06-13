import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  restore,
  modal,
  popover,
  describeEE,
  openNativeEditor,
  rightSidebar,
  setTokenFeatures,
  onlyOnOSS,
  entityPickerModal,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP } = USER_GROUPS;

describe("scenarios > question > snippets (OSS)", { tags: "@OSS" }, () => {
  beforeEach(() => {
    onlyOnOSS();
    restore();
  });

  it("should display nested snippets in a flat list", () => {
    createNestedSnippet();

    // Open editor and sidebar
    openNativeEditor();
    cy.icon("snippet").click();

    // Confirm snippet is not in folder
    rightSidebar().within(() => {
      cy.findByText("snippet 1").should("be.visible");
    });
  });
});

describeEE("scenarios > question > snippets (EE)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  ["admin", "normal"].forEach(user => {
    it(`${user} user can create a snippet (metabase#21581)`, () => {
      cy.intercept("POST", "/api/native-query-snippet").as("snippetCreated");

      cy.signIn(user);

      openNativeEditor();
      cy.icon("snippet").click();
      cy.findByTestId("sidebar-content").findByText("Create a snippet").click();

      modal().within(() => {
        cy.findByLabelText(
          "Enter some SQL here so you can reuse it later",
        ).type("SELECT 1", { delay: 0 });
        cy.findByLabelText("Give your snippet a name").type("one", {
          delay: 0,
        });
        cy.button("Save").click();
      });

      cy.wait("@snippetCreated");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("{{snippet: one}}");

      cy.icon("play").first().click();
      cy.findByTestId("scalar-value").contains(1);
    });
  });

  it("should let you create a snippet folder and move a snippet into it", () => {
    cy.signInAsAdmin();
    // create snippet via API
    cy.request("POST", "/api/native-query-snippet", {
      content: "snippet 1",
      name: "snippet 1",
      collection_id: null,
    });

    openNativeEditor();

    // create folder
    cy.icon("snippet").click();
    cy.findByTestId("sidebar-right").as("sidebar").find(".Icon-add").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("New folder").click());
    modal().within(() => {
      cy.findByText("Create your new folder");
      cy.findByLabelText("Give your folder a name").type(
        "my favorite snippets",
      );
      cy.findByText("Create").click();
    });

    // move snippet into folder
    cy.get("@sidebar")
      .findByText("snippet 1")
      .parent()
      .parent()
      .parent()
      .within(() => {
        cy.icon("chevrondown").click({ force: true });
      });

    rightSidebar().within(() => {
      cy.findByText("Edit").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    modal().within(() => cy.findByText("Top folder").click());
    entityPickerModal().within(() => {
      cy.findByText("my favorite snippets").click();
      cy.findByText("Select").click();
    });
    cy.intercept("/api/collection/root/items?namespace=snippets").as(
      "updateList",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    modal().within(() => cy.findByText("Save").click());

    // check that everything is in the right spot
    cy.wait("@updateList");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("snippet 1").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("my favorite snippets").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("snippet 1");
  });

  ["admin", "nocollection"].map(user => {
    it("should display nested snippets in their folder", () => {
      createNestedSnippet();

      cy.signIn(user);

      // Open editor and sidebar
      openNativeEditor();
      cy.icon("snippet").click();

      // Confirm snippet is in folder
      rightSidebar().within(() => {
        cy.findByText("Snippet Folder").click();
        cy.findByText("snippet 1").click();
      });
    });
  });

  describe("existing snippet folder", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/collection/root").as("collections");

      cy.signInAsAdmin();

      cy.request("POST", "/api/collection", {
        name: "Snippet Folder",
        description: null,
        parent_id: null,
        namespace: "snippets",
      });
    });

    it("should not display snippet folder as part of collections (metabase#14907)", () => {
      cy.visit("/collection/root");

      cy.wait("@collections");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Snippet Folder").should("not.exist");
    });

    it("shouldn't update root permissions when changing permissions on a created folder (metabase#17268)", () => {
      cy.intercept("PUT", "/api/collection/graph").as("updatePermissions");

      openNativeEditor();
      cy.icon("snippet").click();

      // Edit permissions for a snippet folder
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Snippet Folder")
          .next()
          .find(".Icon-ellipsis")
          .click({ force: true });
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Change permissions").click();

      // Update permissions for "All users" and let them only "View" this folder
      modal().within(() => {
        getPermissionsForUserGroup("All Users")
          .should("contain", "Curate")
          .click();
      });

      popover().contains("View").click();
      cy.button("Save").click();

      cy.wait("@updatePermissions");

      // Now let's do the sanity check for the top level (root) snippet permissions and make sure nothing changed there
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Snippets").parent().next().find(".Icon-ellipsis").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Change permissions").click();

      // UI check
      modal().within(() => {
        getPermissionsForUserGroup("All Users").should("contain", "Curate");
      });

      // API check
      cy.get("@updatePermissions").then(intercept => {
        const { groups } = intercept.response.body;
        const allUsers = groups[ALL_USERS_GROUP];

        expect(allUsers.root).to.equal("write");
      });
    });
  });
});

function createNestedSnippet() {
  cy.signInAsAdmin();
  // Create snippet folder via API
  cy.request("POST", "/api/collection", {
    name: "Snippet Folder",
    description: null,
    parent_id: null,
    namespace: "snippets",
  }).then(({ body: { id } }) => {
    // Create snippet in folder via API
    cy.request("POST", "/api/native-query-snippet", {
      content: "snippet 1",
      name: "snippet 1",
      collection_id: id,
    });
  });
}

function getPermissionsForUserGroup(userGroup) {
  return cy
    .findByText(userGroup)
    .closest("tr")
    .find("[data-testid=permissions-select]");
}
