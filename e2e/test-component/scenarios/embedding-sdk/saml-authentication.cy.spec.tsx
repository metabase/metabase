import { StaticQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import {
  MOCK_SAML_IDP_URI,
  signInAsAdminAndEnableEmbeddingSdkWithSaml,
  stubWindowOpenForSamlPopup,
} from "e2e/support/helpers/embedding-sdk-testing";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

/**
 * Adds the Origin header to all requests.
 * The backend requires this header but component tests don't send it.
 */
function addOriginHeader() {
  cy.intercept("*", (req) => {
    req.headers["origin"] = "http://localhost";
    req.continue();
  });
}

describe("scenarios > embedding-sdk > saml-authentication", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdkWithSaml();

    createQuestion({
      name: "SAML Test Question",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        limit: 2,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
    });

    cy.signOut();
  });

  it("can authenticate via SAML and load question content", () => {
    addOriginHeader();
    cy.intercept("GET", "/auth/sso*").as("authSso");

    stubWindowOpenForSamlPopup();

    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(<StaticQuestion questionId={questionId} />);
    });

    // Verify the SDK called the real /auth/sso endpoint and got SAML response
    cy.wait("@authSso").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body).to.have.property("method", "saml");
      // The URL should contain our configured IdP URI with SAMLRequest
      expect(response?.body.url).to.include(MOCK_SAML_IDP_URI);
      expect(response?.body.url).to.include("SAMLRequest");
    });

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");
      cy.findByText("Count").should("be.visible");
    });
  });

  it("shows an error when SAML authentication fails with invalid session", () => {
    addOriginHeader();
    stubWindowOpenForSamlPopup({ isUserValid: false });

    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(<StaticQuestion questionId={questionId} />, {
        waitForUser: false,
      });
    });

    getSdkRoot().within(() => {
      cy.findByRole("alert", { timeout: 10000 }).should(
        "contain",
        "Failed to fetch the user",
      );
    });
  });
});
