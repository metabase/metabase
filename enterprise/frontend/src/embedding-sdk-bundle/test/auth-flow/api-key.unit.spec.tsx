import { waitForRequest } from "__support__/utils";
import { defineMetabaseAuthConfig } from "embedding-sdk-bundle/components/public";

import { MOCK_API_KEY, MOCK_INSTANCE_URL } from "../mocks/sso";

import { setup } from "./setup";

describe("Auth Flow - API Key", () => {
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
