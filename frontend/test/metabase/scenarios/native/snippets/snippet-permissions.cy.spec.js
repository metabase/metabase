import {
  restore,
  modal,
  popover,
  describeEE,
  openNativeEditor,
} from "__support__/e2e/helpers";

describeEE("scenarios > question > snippets", () => {
  beforeEach(() => {
    restore();
  });

  // Please uncomment "normal" user when #21581 gets fixed
  ["admin" /*"normal"*/].forEach(user => {
    it(`${user} user can create a snippet (metabase#21581)`, () => {
      cy.intercept("POST", "/api/native-query-snippet").as("snippetCreated");

      cy.signIn(user);

      openNativeEditor();
      cy.icon("snippet").click();
      cy.contains("Create a snippet").click();

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
      cy.findByText("{{snippet: one}}");

      cy.icon("play")
        .first()
        .click();
      cy.get(".ScalarValue").contains(1);
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
    cy.findByTestId("sidebar-right")
      .as("sidebar")
      .find(".Icon-add")
      .click();
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
        cy.findByText("Edit").click();
      });
    modal().within(() => cy.findByText("Top folder").click());
    popover().within(() => cy.findByText("my favorite snippets").click());
    cy.server();
    cy.route("/api/collection/root/items?namespace=snippets").as("updateList");
    modal().within(() => cy.findByText("Save").click());

    // check that everything is in the right spot
    cy.wait("@updateList");
    cy.findByText("snippet 1").should("not.exist");
    cy.findByText("my favorite snippets").click();
    cy.findByText("snippet 1");
  });

  describe("existing snippet folder", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/collection/root").as("collections");

      cy.signInAsAdmin();

      cy.request("POST", "/api/collection", {
        name: "Snippet Folder",
        description: null,
        color: "#509EE3",
        parent_id: null,
        namespace: "snippets",
      });
    });

    it("should not display snippet folder as part of collections (metabase#14907)", () => {
      cy.visit("/collection/root");

      cy.wait("@collections");
      cy.findByText("Snippet Folder").should("not.exist");
    });

    it("shouldn't update root permissions when changing permissions on a created folder (metabase#17268)", () => {
      cy.intercept("PUT", "/api/collection/graph").as("updatePermissions");

      openNativeEditor();
      cy.icon("snippet").click();

      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Snippet Folder")
          .next()
          .find(".Icon-ellipsis")
          .click({ force: true });
      });

      cy.findByText("Change permissions").click();

      // Update permissions for "All users"
      modal().within(() => {
        cy.findByTestId("permission-table")
          .find(".Icon-close")
          .first()
          .click();
      });

      cy.findAllByRole("option")
        .contains("View")
        .click();
      cy.button("Save").click();

      cy.wait("@updatePermissions");

      cy.findByText("Snippets")
        .parent()
        .next()
        .find(".Icon-ellipsis")
        .click();
      cy.findByText("Change permissions").click();

      // UI check
      modal().within(() => {
        cy.icon("eye").should("not.exist");
      });

      // API check
      cy.get("@updatePermissions").then(intercept => {
        const { groups } = intercept.response.body;
        const allUsers = groups["1"];

        expect(allUsers.root).to.equal("none");
      });
    });
  });
});
