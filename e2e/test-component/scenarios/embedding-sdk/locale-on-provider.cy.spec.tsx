import {
  InteractiveQuestion,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getMetabaseInstanceUrl } from "e2e/support/helpers";
import { updateSetting } from "e2e/support/helpers/api";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

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
        metabaseInstanceUrl: getMetabaseInstanceUrl(),
      }}
      locale={locale}
    >
      <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
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
      cy.findByText("Zusammenfassen").should("exist");
    });
  });

  it("when locale=de it should display german text", () => {
    setup({ locale: "de" });

    getSdkRoot().within(() => {
      cy.findByText("Zusammenfassen").should("exist");
    });
  });

  it("when locale=de-CH it should fallback to `de.json`", () => {
    setup({ locale: "de-CH" });

    cy.request("/app/locales/de.json").then((response) => {
      expect(response.status).to.eq(200);
    });

    getSdkRoot().within(() => {
      cy.findByText("Zusammenfassen").should("exist");
    });
  });

  it("when locale=pt it should fallback to pt_BR.json", () => {
    setup({ locale: "pt" });

    cy.request("/app/locales/pt_BR.json").then((response) => {
      expect(response.status).to.eq(200);
    });

    getSdkRoot().within(() => {
      cy.findByText("Resumir").should("exist");
    });
  });

  it("when locale=zh-TW it use it as it's available", () => {
    setup({ locale: "zh-TW" });

    cy.request("/app/locales/zh_TW.json").then((response) => {
      expect(response.status).to.eq(200);
    });

    getSdkRoot().within(() => {
      cy.findByText("匯總(Summarize)").should("exist");
    });
  });

  it("when invalid locale, it should fallback to en", () => {
    setup({ locale: "XY" });

    // should not do any request, as `en` doesn't need loading
    getSdkRoot().within(() => {
      cy.findByText("Summarize").should("exist");
    });
  });
});
