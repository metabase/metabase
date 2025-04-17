import {
  InteractiveDashboard,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { updateSetting } from "e2e/support/helpers/api";
import {
  AUTH_PROVIDER_URL,
  METABASE_INSTANCE_URL,
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

function setup({
  locale,
  instanceLocale,
}: {
  locale?: string;
  instanceLocale?: string;
}) {
  signInAsAdminAndEnableEmbeddingSdk();

  if (instanceLocale) {
    updateSetting("site-locale", instanceLocale);
  }

  cy.signOut();

  mockAuthProviderAndJwtSignIn();

  cy.mount(
    <MetabaseProvider
      authConfig={{
        authProviderUri: AUTH_PROVIDER_URL,
        metabaseInstanceUrl: METABASE_INSTANCE_URL,
      }}
      locale={locale}
    >
      <InteractiveDashboard dashboardId={ORDERS_DASHBOARD_ID} />,
    </MetabaseProvider>,
  );

  cy.wait("@getUser").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });
}

describe("scenarios > embedding-sdk > locale set on MetabaseProvider", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/user/current").as("getUser");
  });

  it("when no locale is set, it should use the instance locale", () => {
    setup({ locale: undefined, instanceLocale: "de" });

    cy.request("/app/locales/de.json").then((response) => {
      expect(response.status).to.eq(200);
    });

    getSdkRoot().within(() => {
      cy.findByRole("button", {
        name: "Automatische Aktualisierung",
      }).should("exist");
    });
  });

  it("when locale=de it should display german text", () => {
    setup({ locale: "de" });

    getSdkRoot().within(() => {
      cy.findByRole("button", {
        name: "Automatische Aktualisierung",
      }).should("exist");
    });
  });

  it("when locale=de-CH it should fallback to `de.json`", () => {
    setup({ locale: "de-CH" });

    cy.request("/app/locales/de.json").then((response) => {
      expect(response.status).to.eq(200);
    });

    getSdkRoot().within(() => {
      cy.findByRole("button", {
        name: "Automatische Aktualisierung",
      }).should("exist");
    });
  });

  it("when locale=pt it should fallback to pt_BR.json", () => {
    setup({ locale: "pt" });

    cy.request("/app/locales/pt_BR.json").then((response) => {
      expect(response.status).to.eq(200);
    });

    getSdkRoot().within(() => {
      cy.findByRole("button", {
        name: "Atualização automática",
      }).should("exist");
    });
  });

  it("when locale=zh-TW it use it as it's available", () => {
    setup({ locale: "zh-TW" });

    cy.request("/app/locales/zh_TW.json").then((response) => {
      expect(response.status).to.eq(200);
    });

    getSdkRoot().within(() => {
      cy.findByRole("button", {
        name: "自動刷新",
      }).should("exist");
    });
  });

  it("when invalid locale, it should fallback to en", () => {
    setup({ locale: "XY" });

    // should not do any request, as `en` doesn't need loading
    getSdkRoot().within(() => {
      cy.findByRole("button", {
        name: "Auto Refresh",
      }).should("exist");
    });
  });
});
