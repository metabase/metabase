import { signInAsAdmin, restore, openOrdersTable } from "__support__/cypress";

describe("scenarios > admin > settings", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should save a setting", () => {
    cy.server();
    cy.route("PUT", "**/admin-email").as("saveSettings");

    cy.visit("/admin/settings/general");

    // aliases don't last past refreshes, so create a function to grab the input
    // rather than aliasing it with .as()
    const emailInput = () =>
      cy
        .contains("Email Address for Help Requests")
        .parent()
        .parent()
        .find("input");

    emailInput()
      .clear()
      .type("other.email@metabase.com")
      .blur();
    cy.wait("@saveSettings");

    cy.visit("/admin/settings/general");
    // after we refreshed, the field should still be "other.email"
    emailInput().should("have.value", "other.email@metabase.com");

    // reset the email
    emailInput()
      .clear()
      .type("bob@metabase.com")
      .blur();
    cy.wait("@saveSettings");
  });

  it("should update the formatting", () => {
    cy.server();
    cy.route("PUT", "**/custom-formatting").as("saveFormatting");

    // update the formatting
    cy.visit("/admin/settings/formatting");
    cy.contains("17:24 (24-hour clock)").click();
    cy.wait("@saveFormatting");

    // check the new formatting in a question
    openOrdersTable();
    cy.contains(/^February 11, 2019, 21:40$/).debug();

    // reset the formatting
    cy.visit("/admin/settings/formatting");
    cy.contains("5:24 PM (12-hour clock)").click();
    cy.wait("@saveFormatting");

    // check the reset formatting in a question
    openOrdersTable();
    cy.contains(/^February 11, 2019, 9:40 PM$/);
  });

  it("should validate a premium embedding token has a valid format", () => {
    cy.server();
    cy.route("PUT", "/api/setting/premium-embedding-token").as(
      "saveEmbeddingToken",
    );

    cy.visit("/admin/settings/embedding_in_other_applications");
    cy.contains("Premium embedding");
    cy.contains("Enter a token").click();

    // Try an invalid token format
    cy.contains("Enter the token")
      .next()
      .type("Hi")
      .blur();
    cy.wait("@saveEmbeddingToken").then(({ response }) => {
      expect(response.body).to.equal(
        "Token format is invalid. Token should be 64 hexadecimal characters.",
      );
    });
    cy.contains("Token format is invalid.");
  });

  it("should validate a premium embedding token exists", () => {
    cy.server();
    cy.route("PUT", "/api/setting/premium-embedding-token").as(
      "saveEmbeddingToken",
    );

    cy.visit("/admin/settings/embedding_in_other_applications");
    cy.contains("Premium embedding");
    cy.contains("Enter a token").click();

    // Try a valid format, but an invalid token
    cy.contains("Enter the token")
      .next()
      .type("11397b1e60cfb1372f2f33ac8af234a15faee492bbf5c04d0edbad76da3e614a")
      .blur();
    cy.wait("@saveEmbeddingToken").then(({ response }) => {
      expect(response.body).to.equal(
        "Unable to validate token: 404 not found.",
      );
    });
    cy.contains("Unable to validate token: 404 not found.");
  });

  it("should be able to set a premium embedding token", () => {
    // A random embedding token with valid format
    let embeddingToken =
      "11397b1e60cfb1372f2f33ac8af234a15faee492bbf5c04d0edbad76da3e614a";

    cy.server();
    cy.route({
      method: "PUT",
      url: "/api/setting/premium-embedding-token",
      response: embeddingToken,
    }).as("saveEmbeddingToken");

    cy.visit("/admin/settings/embedding_in_other_applications");
    cy.contains("Premium embedding");
    cy.contains("Enter a token").click();

    cy.route("GET", "/api/session/properties").as("getSessionProperties");
    cy.route({
      method: "GET",
      url: "/api/setting",
      response: [
        { key: "enable-embedding", value: true },
        { key: "embedding-secret-key", value: embeddingToken },
        { key: "premium-embedding-token", value: embeddingToken },
      ],
    }).as("getSettings");

    cy.contains("Enter the token")
      .next()
      .type(embeddingToken)
      .blur();
    cy.wait("@saveEmbeddingToken").then(({ response }) => {
      expect(response.body).to.equal(embeddingToken);
    });
    cy.wait("@getSessionProperties");
    cy.wait("@getSettings");
    cy.contains("Premium embedding enabled");
  });
});
