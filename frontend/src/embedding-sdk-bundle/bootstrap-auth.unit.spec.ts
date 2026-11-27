import fetchMock from "fetch-mock";

import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";

import { waitForAuthConfigAndStartEarlyAuthFlow } from "./bootstrap-auth";

const INSTANCE_URL = "http://localhost:3000";

describe("waitForAuthConfigAndStartEarlyAuthFlow", () => {
  beforeEach(() => {
    delete window.METABASE_EMBEDDING_SDK_AUTH_STATE;
    fetchMock.get(
      `begin:${INSTANCE_URL}/auth/sso`,
      { status: 400, body: { status: "error-sso-disabled" } },
      { name: "auth-sso" },
    );
  });

  afterEach(() => {
    ensureMetabaseProviderPropsStore().cleanup();
    delete window.METABASE_EMBEDDING_SDK_AUTH_STATE;
  });

  it("should skip SSO discovery for guest auth config", async () => {
    ensureMetabaseProviderPropsStore().setProps({
      authConfig: { metabaseInstanceUrl: INSTANCE_URL, isGuest: true },
    });

    waitForAuthConfigAndStartEarlyAuthFlow();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(fetchMock.callHistory.called("auth-sso")).toBe(false);
    expect(window.METABASE_EMBEDDING_SDK_AUTH_STATE).toEqual({
      status: "skipped",
    });
  });
});
