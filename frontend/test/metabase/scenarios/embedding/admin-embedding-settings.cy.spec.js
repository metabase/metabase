import { restore, version } from "__support__/e2e/cypress";

describe("admin > settings > embedding ", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  if (version.edition !== "enterprise") {
    describe(" > embedding settings", () => {
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
          .type(
            "11397b1e60cfb1372f2f33ac8af234a15faee492bbf5c04d0edbad76da3e614a",
          )
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
        const embeddingToken =
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
  }
});
