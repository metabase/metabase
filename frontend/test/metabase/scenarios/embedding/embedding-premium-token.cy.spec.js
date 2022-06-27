import { restore, isOSS } from "__support__/e2e/helpers";

const embeddingPage = "/admin/settings/embedding_in_other_applications";
const licensePage = "/admin/settings/premium-embedding-license";

// A random embedding token with valid format
const embeddingToken =
  "11397b1e60cfb1372f2f33ac8af234a15faee492bbf5c04d0edbad76da3e614a";

const invalidTokenMessage =
  "This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.";

const discountedWarning =
  "Our Premium Embedding product has been discontinued, but if you already have a license you can activate it here. You’ll continue to receive support for the duration of your license.";

describe(
  "scenarios > embedding > premium embedding token",
  { tags: "@OSS" },
  () => {
    beforeEach(() => {
      cy.onlyOn(isOSS);

      restore();
      cy.signInAsAdmin();
    });

    it("should validate a premium embedding token", () => {
      cy.intercept("PUT", "/api/setting/premium-embedding-token").as(
        "saveEmbeddingToken",
      );

      cy.visit(embeddingPage);

      cy.contains("Have a Premium Embedding license?");
      cy.contains("Activate it here.").click();

      cy.location("pathname").should("eq", licensePage);

      cy.findByRole("heading")
        .invoke("text")
        .should("eq", "Premium embedding");

      cy.findByText(discountedWarning);

      cy.findByText(
        "Enter the token you bought from the Metabase Store below.",
      );

      cy.findByTestId("license-input")
        .as("tokenInput")
        .should("be.empty");

      // 1. Try an invalid token format
      cy.get("@tokenInput").type("Hi");
      cy.button("Activate").click();

      cy.wait("@saveEmbeddingToken").then(({ response: { body } }) => {
        expect(body.cause).to.eq("Token format is invalid.");
        expect(body["error-details"]).to.eq(
          "Token should be 64 hexadecimal characters.",
        );
      });

      cy.findByText(invalidTokenMessage);

      // 2. Try a valid format, but an invalid token
      cy.get("@tokenInput")
        .clear()
        .type(embeddingToken);
      cy.button("Activate").click();

      cy.wait("@saveEmbeddingToken").then(({ response: { body } }) => {
        expect(body.cause).to.eq("Token does not exist.");
        expect(body["error-details"]).to.be.null;
      });

      cy.findByText(invalidTokenMessage);

      // 3. Try submitting an empty value
      //    Although this might sound counterintuitive, the goal is to provide a mechanism to reset a token.
      cy.get("@tokenInput").clear();
      cy.button("Activate").click();

      cy.wait("@saveEmbeddingToken").then(({ response: { body } }) => {
        expect(body).to.eq("");
      });

      cy.findByText(invalidTokenMessage).should("not.exist");
    });

    it("should be able to set a premium embedding token", () => {
      stubTokenResponses();

      cy.visit(licensePage);

      cy.findByTestId("license-input").type(embeddingToken);
      cy.button("Activate").click();

      cy.wait("@saveEmbeddingToken").then(({ response }) => {
        expect(response.body).to.eq(embeddingToken);
      });

      cy.wait("@getSettings");
      cy.findByText(
        /Your Premium Embedding license is active until Dec 3(0|1), 2122\./,
      );
    });
  },
);

function stubTokenResponses() {
  cy.intercept("PUT", "/api/setting/premium-embedding-token", {
    body: embeddingToken,
  }).as("saveEmbeddingToken");

  cy.request("GET", "/api/setting").then(({ body: stubbedBody }) => {
    const tokenSetting = stubbedBody.find(
      setting => setting.key === "premium-embedding-token",
    );
    tokenSetting.value = embeddingToken;

    cy.intercept("GET", "api/setting", stubbedBody).as("getSettings");
  });

  cy.intercept("GET", "/api/premium-features/token/status", {
    body: {
      valid: true,
      status: "Token is valid.",
      features: ["embedding"],
      trial: false,
      "valid-thru": "2122-12-30T23:00:00Z",
    },
  });
}
