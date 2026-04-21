import { waitForRequest } from "__support__/utils";
import {
  MOCK_API_KEY,
  MOCK_INSTANCE_URL,
} from "embedding-sdk-bundle/test/mocks/sso";
import { defineMetabaseAuthConfig } from "embedding-sdk-package/lib/public/define-metabase-auth-config";

import { setupEmbeddingSdkEnterprisePlugins } from "../support";

import { setup } from "./setup";

describe("Auth Flow - API Key", () => {
  beforeEach(() => {
    setupEmbeddingSdkEnterprisePlugins();
  });

  it("should send the api key as 'X-Api-Key' header", async () => {
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
      apiKey: MOCK_API_KEY,
    });

    const { getLastCardQueryApiCall, getLastUserApiCall } = setup({
      authConfig,
    });

    await waitForRequest(() => getLastUserApiCall());
    expect(getLastUserApiCall()?.options.headers).toHaveProperty(
      "x-api-key",
      MOCK_API_KEY,
    );

    await waitForRequest(() => getLastCardQueryApiCall());
    expect(getLastCardQueryApiCall()?.options.headers).toHaveProperty(
      "x-api-key",
      MOCK_API_KEY,
    );

    await waitForRequest(() => getLastCardQueryApiCall());
    expect(getLastCardQueryApiCall()?.options.headers).toHaveProperty(
      "x-api-key",
      MOCK_API_KEY,
    );
  });
});
