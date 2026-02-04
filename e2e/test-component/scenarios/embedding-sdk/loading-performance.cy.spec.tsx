import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import {
  AUTH_PROVIDER_URL,
  getMetabaseInstanceUrl,
} from "e2e/support/helpers/embedding-sdk-helpers/constants";
import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";

describe("scenarios > embedding-sdk > loading-performance", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    // Intercept SSO discovery request (without jwt parameter)
    cy.intercept("GET", /\/auth\/sso(\?preferred_method=\w+)?$/).as(
      "authSsoDiscovery",
    );
    // Intercept token exchange request (with jwt parameter)
    cy.intercept("GET", /\/auth\/sso\?.*jwt=/).as("authSsoTokenExchange");
    cy.intercept("GET", "/api/user/current").as("getCurrentUser");
    cy.intercept("GET", "/api/session/properties").as("getSessionProperties");
  });

  describe("Baseline: when jwtProviderUri is not provided", () => {
    it("should make SSO discovery request, then token exchange", () => {
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        sdkProviderProps: {
          authConfig: {
            metabaseInstanceUrl: getMetabaseInstanceUrl(),
          },
        },
      });

      // Verify question renders
      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
        cy.findByTestId("visualization-root").should("be.visible");
      });

      // Baseline: discovery + token exchange
      cy.get("@authSsoDiscovery.all").should("have.length", 1);
      cy.get("@authSsoTokenExchange.all").should("have.length", 1);
      cy.get("@getCurrentUser.all").should("have.length", 1);
      cy.get("@getSessionProperties.all").should("have.length", 1);
    });
  });

  describe("when jwtProviderUri is provided", () => {
    it("should skip the initial /auth/sso request", () => {
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        sdkProviderProps: {
          authConfig: {
            metabaseInstanceUrl: getMetabaseInstanceUrl(),
            preferredAuthMethod: "jwt",
            jwtProviderUri: AUTH_PROVIDER_URL,
          },
        },
      });

      // Verify question renders
      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
        cy.findByTestId("visualization-root").should("be.visible");
      });

      // Optimized: no discovery, only token exchange
      cy.get("@authSsoDiscovery.all").should("have.length", 0);
      cy.get("@authSsoTokenExchange.all").should("have.length", 1);
      cy.get("@getCurrentUser.all").should("have.length", 1);
      cy.get("@getSessionProperties.all").should("have.length", 1);
    });
  });
});
