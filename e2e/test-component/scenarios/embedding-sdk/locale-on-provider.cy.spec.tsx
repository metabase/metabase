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

function setup({ locale }: { locale: string }) {
  cy.mount(
    <MetabaseProvider
      authConfig={{
        authProviderUri: AUTH_PROVIDER_URL,
        metabaseInstanceUrl: METABASE_INSTANCE_URL,
      }}
      locale={locale}
    >
      <StaticDashboard dashboardId={ORDERS_DASHBOARD_ID} withDownloads />,
    </MetabaseProvider>,
  );

  cy.wait("@getUser").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });
}

describeEE("scenarios > embedding-sdk > locale set on MetabaseProvider", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "/api/user/current").as("getUser");
  });

  it("when locale=de it should display german text", () => {
    setup({ locale: "de" });

    getSdkRoot().findByText("Als PDF exportieren").should("exist");
  });

  it("when locale=de-CH it should fallback to `de.json`", () => {
    setup({ locale: "de-CH" });

    cy.request("/app/locales/de.json").then(response => {
      expect(response.status).to.eq(200);
    });

    getSdkRoot().findByText("Als PDF exportieren").should("exist");
  });

  it("when locale=pt it should fallback to pt_BR.json", () => {
    setup({ locale: "pt" });

    cy.request("/app/locales/pt_BR.json").then(response => {
      expect(response.status).to.eq(200);
    });

    getSdkRoot().findByText("Exportar como PDF").should("exist");
  });

  it("when locale=zh-TW it use it as it's available", () => {
    setup({ locale: "zh-TW" });

    cy.request("/app/locales/zh_TW.json").then(response => {
      expect(response.status).to.eq(200);
    });

    getSdkRoot().findByText("導出為 PDF").should("exist");
  });

  it("when invalid locale, it should fallback to en", () => {
    setup({ locale: "XY" });

    // should not do any request, as `en` doesn't need loading

    getSdkRoot().findByText("Export as PDF").should("exist");
  });
});
