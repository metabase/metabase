import { restore, isOSS } from "e2e/support/helpers";

const embeddingPage = "/admin/settings/embedding-in-other-applications";
const licensePage = "/admin/settings/premium-embedding-license";
const upgradeUrl = "https://www.metabase.com/upgrade";

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
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Full-app embedding").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(
        "With some of our paid plans, you can embed the full Metabase app and enable your users to drill-through to charts, browse collections, and use the graphical query builder. You can also get priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers.",
      );
      assertLinkMatchesUrl("some of our paid plans,", upgradeUrl);

      // Old premium embedding page
      cy.visit(licensePage);

      cy.findByRole("heading").invoke("text").should("eq", "Premium embedding");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(discountedWarning);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Enter the token you bought from the Metabase Store below.",
      );

      cy.findByTestId("license-input").as("tokenInput").should("be.empty");

      // 1. Try an invalid token format
      cy.get("@tokenInput").type("Hi");
      cy.button("Activate").click();

      cy.wait("@saveEmbeddingToken").then(({ response: { body } }) => {
        expect(body.cause).to.eq("Token format is invalid.");
        expect(body["error-details"]).to.eq(
          "Token should be 64 hexadecimal characters.",
        );
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(invalidTokenMessage);

      // 2. Try a valid format, but an invalid token
      cy.get("@tokenInput").clear().type(embeddingToken);
      cy.button("Activate").click();

      cy.wait("@saveEmbeddingToken").then(({ response: { body } }) => {
        expect(body.cause).to.eq("Token does not exist.");
        expect(body["error-details"]).to.be.null;
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(invalidTokenMessage);

      // 3. Try submitting an empty value
      //    Although this might sound counterintuitive, the goal is to provide a mechanism to reset a token.
      cy.get("@tokenInput").clear();
      cy.button("Activate").click();

      cy.wait("@saveEmbeddingToken").then(({ response: { body } }) => {
        expect(body).to.eq("");
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

function assertLinkMatchesUrl(text, url) {
  cy.findByRole("link", { name: text })
    .should("have.attr", "href")
    .and("contain", url);
}
