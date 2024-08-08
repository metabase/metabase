import {
  conditionalDescribe,
  isEE,
} from "e2e/support/helpers/e2e-enterprise-helpers";

const isSdk = Cypress.env("IS_EMBEDDING_SDK");

export const describeSDK = conditionalDescribe(isEE && isSdk);

export const EMBEDDING_SDK_STORY_HOST = "http://localhost:6006/iframe.html";
