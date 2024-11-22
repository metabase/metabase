import {
  MetabaseProvider,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { describeEE, updateSetting } from "e2e/support/helpers";
import {
  DEFAULT_SDK_PROVIDER_CONFIG,
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

describeEE("scenarios > embedding-sdk > static-dashboard", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "/api/user/current").as("getUser");
  });

  describe("style leaking", () => {
    it("[success scenario] should use the default fonts outside of our components, and Lato on our components", () => {
      wrapBrowserDefaultFont();

      cy.mount(
        <div>
          <h1>No styles applied anywhere, should use browser default</h1>
          <div style={{ border: "1px solid black" }}>
            <h1>This is outside of the provider</h1>
          </div>

          <MetabaseProvider config={DEFAULT_SDK_PROVIDER_CONFIG}>
            <div style={{ border: "1px solid black" }}>
              <h1>This is inside of the provider</h1>
            </div>

            <StaticQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </div>,
      );

      cy.wait("@getUser").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      cy.get("@defaultBrowserFontFamily").then(defaultBrowserFontFamily => {
        cy.findByText("This is outside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFontFamily,
        );
        cy.findByText("This is inside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFontFamily,
        );
        cy.findByText("Product ID").should(
          "have.css",
          "font-family",
          "Lato, sans-serif",
        );
      });
    });

    it("[error scenario] should use the default fonts outside of our components, and Lato on our components", () => {
      wrapBrowserDefaultFont();

      cy.mount(
        <div>
          <h1>No styles applied anywhere, should use browser default</h1>
          <div style={{ border: "1px solid black" }}>
            <h1>This is outside of the provider</h1>
          </div>

          <MetabaseProvider
            config={{
              apiKey: "TEST",
              metabaseInstanceUrl: "http://fake-host:1234",
            }}
          >
            <div style={{ border: "1px solid black" }}>
              <h1>This is inside of the provider</h1>
            </div>

            <StaticQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </div>,
      );

      cy.wait("@getUser");

      cy.get("@defaultBrowserFontFamily").then(defaultBrowserFontFamily => {
        cy.findByText("This is outside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFontFamily,
        );

        cy.findByText("This is inside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFontFamily,
        );

        cy.findByText(/Failed to fetch the user/).should(
          "have.css",
          "font-family",
          "Lato, sans-serif",
        );
      });
    });
  });

  describe("fontFamily", () => {
    it("should use the font from the theme if set", () => {
      cy.mount(
        <MetabaseProvider
          config={DEFAULT_SDK_PROVIDER_CONFIG}
          theme={{ fontFamily: "Impact" }}
        >
          <StaticQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.wait("@getUser").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      getSdkRoot()
        .findByText("Product ID")
        .should("have.css", "font-family", "Impact, sans-serif");
    });

    it("should fallback to the font from the instance if no fontFamily is set on the theme", () => {
      cy.signInAsAdmin();
      updateSetting("application-font", "Roboto Mono");
      cy.signOut();

      cy.intercept("GET", "/api/user/current").as("getUser");

      cy.mount(
        <div>
          <h1>No styles applied anywhere, should use browser default</h1>
          <div style={{ border: "1px solid black" }}>
            <h1>This is outside of the provider</h1>
          </div>

          <MetabaseProvider config={DEFAULT_SDK_PROVIDER_CONFIG}>
            <div style={{ border: "1px solid black" }}>
              <h1>This is inside of the provider</h1>
            </div>

            <StaticQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </div>,
      );

      cy.wait("@getUser").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      getSdkRoot()
        .findByText("Product ID")
        .should("have.css", "font-family", '"Roboto Mono", sans-serif');
    });

    it("should work with 'Custom' fontFamily, using the font files linked in the instance", () => {
      cy.signInAsAdmin();

      const fontUrl =
        Cypress.config().baseUrl +
        "/app/fonts/Open_Sans/OpenSans-Regular.woff2";
      // setting `application-font-files` will make getFont return "Custom"
      updateSetting("application-font-files", [
        {
          src: fontUrl,
          fontWeight: 400,
          fontFormat: "woff2",
        },
      ]);

      cy.signOut();

      cy.intercept("GET", fontUrl).as("fontFile");

      cy.intercept("GET", "/api/user/current").as("getUser");

      cy.mount(
        <div>
          <h1>No styles applied anywhere, should use browser default</h1>
          <div style={{ border: "1px solid black" }}>
            <h1>This is outside of the provider</h1>
          </div>

          <MetabaseProvider config={DEFAULT_SDK_PROVIDER_CONFIG}>
            <div style={{ border: "1px solid black" }}>
              <h1>This is inside of the provider</h1>
            </div>

            <StaticQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </div>,
      );

      cy.wait("@getUser").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      // this test only tests if the file is loaded, not really if it is rendered
      // we'll probably need visual regression tests for that
      cy.wait("@fontFile");

      getSdkRoot()
        .findByText("Product ID")
        .should("have.css", "font-family", "Custom, sans-serif");
    });
  });
});

function wrapBrowserDefaultFont() {
  cy.mount(<p>paragraph with default browser font</p>);

  cy.findByText("paragraph with default browser font").then($element => {
    const fontFamily = $element.css("font-family");
    cy.wrap(fontFamily).as("defaultBrowserFontFamily");
  });
}
