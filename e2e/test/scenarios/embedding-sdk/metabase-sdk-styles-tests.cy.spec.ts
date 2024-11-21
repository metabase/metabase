/* eslint-disable no-unscoped-text-selectors */
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  setTokenFeatures,
  updateSetting,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";
import {
  EMBEDDING_SDK_STORY_HOST,
  describeSDK,
} from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  JWT_SHARED_SECRET,
  setupJwt,
} from "e2e/support/helpers/e2e-jwt-helpers";

const STORIES = {
  NO_STYLES_SUCCESS: "embeddingsdk-styles-tests--no-styles-success",
  NO_STYLES_ERROR: "embeddingsdk-styles-tests--no-styles-error",
  FONT_FROM_CONFIG: "embeddingsdk-styles-tests--font-from-config",
  GET_BROWSER_DEFAUL_FONT:
    "embeddingsdk-styles-tests--get-browser-default-font",
} as const;

describeSDK("scenarios > embedding-sdk > static-dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    setupJwt();
    cy.signOut();
  });

  const wrapBrowserDefaultFont = () => {
    visitFullAppEmbeddingUrl({
      url: EMBEDDING_SDK_STORY_HOST,
      qs: {
        id: STORIES.GET_BROWSER_DEFAUL_FONT,
        viewMode: "story",
      },
    });

    cy.findByText("paragraph with default browser font").then($element => {
      const fontFamily = $element.css("font-family");
      cy.wrap(fontFamily).as("defaultBrowserFonteFamily");
    });
  };

  describe("style leaking", () => {
    it("[success scenario] should use the default fonts outside of our components, and Lato on our components", () => {
      wrapBrowserDefaultFont();

      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: {
          id: STORIES.NO_STYLES_SUCCESS,
          viewMode: "story",
        },
        onBeforeLoad: (window: any) => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.QUESTION_ID = ORDERS_QUESTION_ID;
        },
      });

      cy.get("@defaultBrowserFonteFamily").then(defaultBrowserFonteFamily => {
        cy.findByText("This is outside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFonteFamily,
        );
        cy.findByText("This is inside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFonteFamily,
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

      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: {
          id: STORIES.NO_STYLES_ERROR,
          viewMode: "story",
        },
        onBeforeLoad: (window: any) => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.QUESTION_ID = ORDERS_QUESTION_ID;
        },
      });

      cy.get("@defaultBrowserFonteFamily").then(defaultBrowserFonteFamily => {
        cy.findByText("This is outside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFonteFamily,
        );

        cy.findByText("This is inside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFonteFamily,
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
      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: {
          id: STORIES.FONT_FROM_CONFIG,
          viewMode: "story",
        },
        onBeforeLoad: (window: any) => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.QUESTION_ID = ORDERS_QUESTION_ID;
        },
      });

      cy.findByText("Product ID").should(
        "have.css",
        "font-family",
        "Impact, sans-serif",
      );
    });

    it("should fallback to the font from the instance if no fontFamily is set on the theme", () => {
      cy.signInAsAdmin();
      updateSetting("application-font", "Roboto Mono");
      cy.signOut();

      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: {
          id: STORIES.NO_STYLES_SUCCESS,
          viewMode: "story",
        },
        onBeforeLoad: (window: any) => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.QUESTION_ID = ORDERS_QUESTION_ID;
        },
      });

      cy.findByText("Product ID").should(
        "have.css",
        "font-family",
        '"Roboto Mono", sans-serif',
      );
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

      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: {
          id: STORIES.NO_STYLES_SUCCESS,
          viewMode: "story",
        },
        onBeforeLoad: (window: any) => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.QUESTION_ID = ORDERS_QUESTION_ID;
        },
      });

      // this test only tests if the file is loaded, not really if it is rendered
      // we'll probably need visual regression tests for that
      cy.wait("@fontFile");

      cy.findByText("Product ID").should(
        "have.css",
        "font-family",
        "Custom, sans-serif",
      );
    });
  });
});
