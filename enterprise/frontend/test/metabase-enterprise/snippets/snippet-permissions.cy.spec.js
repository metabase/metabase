import {
  signInAsNormalUser,
  signInAsAdmin,
  restore,
  modal,
  popover,
  sidebar,
  describeWithToken,
} from "__support__/cypress";

describeWithToken("scenarios > question > snippets", () => {
  before(restore);
  beforeEach(signInAsNormalUser);

  it("should let you create a snippet folder and move a snippet into it", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();

    // create snippet via API
    cy.request("POST", "/api/native-query-snippet", {
      content: "snippet 1",
      name: "snippet 1",
      collection_id: null,
    });

    // create folder
    cy.get(".Icon-snippet").click();
    sidebar()
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
    sidebar()
      .findByText("snippet 1")
      .parent()
      .parent()
      .parent()
      .within(() => {
        cy.get(".Icon-chevrondown").click({ force: true });
        cy.findByText("Edit").click();
      });
    modal().within(() => cy.findByText("Top folder").click());
    popover().within(() => cy.findByText("my favorite snippets").click());
    cy.server();
    cy.route("/api/collection/root/items?namespace=snippets").as("updateList");
    modal().within(() => cy.findByText("Save").click());

    // check that everything is in the right spot
    cy.wait("@updateList");
    cy.queryByText("snippet 1").should("not.exist");
    cy.findByText("my favorite snippets").click();
    cy.findByText("snippet 1");
  });

  it("should allow updating snippet folder permissions", () => {
    signInAsAdmin();
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".Icon-snippet").click();

    sidebar()
      .findByText("my favorite snippets")
      .parent()
      .parent()
      .find(".Icon-ellipsis")
      .click({ force: true });
    popover().within(() => cy.findByText("Change permissions").click());
    modal().within(() => {
      cy.findByText("Permissions for this folder");
    });
    // TODO: incomplete
  });
});
