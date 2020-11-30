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
  beforeEach(signInAsAdmin);

  it("can create a snippet", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".Icon-snippet").click();
    cy.contains("Create a snippet").click();
    modal().within(() => {
      cy.findByLabelText("Enter some SQL here so you can reuse it later").type(
        "SELECT 'a snippet darkly'",
      );
      cy.findByLabelText("Give your snippet a name").type("night snippet");
      cy.contains("Save").click();
    });
    cy.get(".Icon-play")
      .first()
      .click();
    cy.get(".ScalarValue").contains("a snippet darkly");
  });

  it("can not create a snippet as a user by default", () => {
    // Note that this is expected behavior, but a little weird because
    // users have to be granted explicit access.
    // See metabase-enterprise#543 for more details

    signInAsNormalUser();

    cy.request({
      method: "POST",
      url: "/api/native-query-snippet",
      body: {
        content: "SELECT 'a snippet in light'",
        name: "light snippet",
        collection_id: null,
      },
      failOnStatusCode: false,
    }).then(resp => {
      expect(resp.status).to.equal(403);
    });
  });

  // [quarantine] because the popover click action is very flaky.
  it.skip("can create a snippet once the admin has granted access", () => {
    // See metabase-enterprise#543 for more details
    // This is kind of a UX issue where the admin has to:
    // - First create a snippet
    // - Then grant All Users access to snippets

    // create snippet via API
    cy.request("POST", "/api/native-query-snippet", {
      content: "SELECT 'a snippet darkly'",
      name: "543 - admin snippet",
      collection_id: null,
    });

    // Grant access
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".Icon-snippet").click();

    sidebar()
      .find(".Icon-ellipsis")
      .click({ force: true });
    popover().within(() => cy.findByText("Change permissions").click());
    modal().within(() => {
      cy.findByText("Permissions for Top folder");
      cy.contains("All Users");
      cy.get(".ReactVirtualized__Grid .Icon-close")
        .first()
        .click();
    });
    // The click action is very flaky, sometimes it doesn't click the right thing
    popover()
      .contains("Grant Edit access")
      .click();
    modal()
      .contains("Save")
      .click();
    // Now the user should be able to create a snippet
    signInAsNormalUser();

    cy.request({
      method: "POST",
      url: "/api/native-query-snippet",
      body: {
        content: "SELECT 'a snippet in light'",
        name: "543 - user snippet",
        collection_id: null,
      },
      failOnStatusCode: false,
    }).then(resp => {
      expect(resp.status).to.equal(200);
    });

    cy.reload();
    cy.get(".Icon-snippet").click();
    cy.contains("543 - admin snippet");
    cy.contains("543 - user snippet");
  });

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
});
