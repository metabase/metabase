import {
  conditionalDescribe,
  isEE,
} from "e2e/support/helpers/e2e-enterprise-helpers";

const isEmbeddingSdk = Cypress.env("IS_EMBEDDING_SDK");

export const describeSDK = conditionalDescribe(isEE && isEmbeddingSdk);

export const EMBEDDING_SDK_STORY_HOST = "http://localhost:6006/iframe.html";
