import {
  MetabaseProvider,
  StaticDashboard,
} from "@metabase/embedding-sdk-react";

import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { describeEE } from "e2e/support/helpers";
import {
  AUTH_PROVIDER_URL,
  METABASE_INSTANCE_URL,
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

describeEE("scenarios > embedding-sdk > locale set on MetabaseProvider", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("when locale=de it should display german text", () => {
    cy.intercept("GET", "/api/user/current").as("getUser");

    cy.mount(
      <MetabaseProvider
        config={{
          authProviderUri: AUTH_PROVIDER_URL,
          metabaseInstanceUrl: METABASE_INSTANCE_URL,
        }}
        locale="de"
      >
        <StaticDashboard dashboardId={ORDERS_DASHBOARD_ID} withDownloads />,
      </MetabaseProvider>,
    );

    cy.wait("@getUser").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });

    getSdkRoot().findByText("Als PDF exportieren").should("exist");
  });
});
