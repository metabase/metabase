import { visitFullAppEmbeddingUrl } from "e2e/support/helpers/e2e-embedding-helpers";
import {
  conditionalDescribe,
  isEE,
  setTokenFeatures,
} from "e2e/support/helpers/e2e-enterprise-helpers";
import {
  JWT_SHARED_SECRET,
  setupJwt,
} from "e2e/support/helpers/e2e-jwt-helpers";

const isEmbeddingSdk = Cypress.env("IS_EMBEDDING_SDK");

export const describeSDK = conditionalDescribe(isEE && isEmbeddingSdk);

export const EMBEDDING_SDK_STORY_HOST = "http://localhost:6006/iframe.html";

export function signInAsAdminAndEnableEmbeddingSdk() {
  cy.signInAsAdmin();
  setTokenFeatures("all");
  setupJwt();
  cy.request("PUT", "/api/setting", {
    "enable-embedding-sdk": true,
  });
}

/** Get storybook args in the format of as "key:value;key:value" */
export function getStorybookArgs(props: Record<string, string>): string {
  const params = new URLSearchParams(props);

  return params.toString().replaceAll("=", ":").replaceAll("&", ";");
}

export const getSdkRoot = () =>
  cy.get("#metabase-sdk-root").should("be.visible");

export const visitSdkStory = ({
  storyId,
  args,
  windowEnvs = {},
}: {
  storyId: string;
  args?: Record<string, string>;
  windowEnvs?: Record<string, unknown>;
}) => {
  visitFullAppEmbeddingUrl({
    url: EMBEDDING_SDK_STORY_HOST,
    qs: {
      id: storyId,
      viewMode: "story",
      ...(args && { args: getStorybookArgs(args) }),
    },
    onBeforeLoad: (window: any) => {
      window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
      window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;

      for (const [key, value] of Object.entries(windowEnvs)) {
        window[key] = value;
      }
    },
  });
};
