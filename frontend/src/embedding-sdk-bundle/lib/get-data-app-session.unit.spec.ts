import fetchMock from "fetch-mock";

import { getSdkStore } from "embedding-sdk-bundle/store";
import { refreshTokenAsync } from "embedding-sdk-bundle/store/auth";
import { openSamlLoginPopup } from "embedding/auth-common";
import { samlTokenStorage } from "metabase/embedding-sdk/lib/saml-token-storage";
import "embedding-sdk-ee/auth";
import { getDataAppSession } from "./get-data-app-session";

jest.mock("embedding/auth-common", () => ({
  ...jest.requireActual("embedding/auth-common"),
  openSamlLoginPopup: jest.fn(),
}));

const instance = "https://metabase.example.com";
const jwtConfig = {
  metabaseInstanceUrl: instance,
  preferredAuthMethod: "jwt" as const,
  jwtProviderUri: "https://host.example.com/jwt",
};
const session = {
  id: "shared-session",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

let store = getSdkStore();

function setSession(token: typeof session | null) {
  store.dispatch(
    refreshTokenAsync.fulfilled(token, "test", {
      metabaseInstanceUrl: instance,
    }),
  );
}

describe("getDataAppSession", () => {
  beforeEach(() => {
    store = getSdkStore();
    samlTokenStorage.remove();
    setSession(null);
  });

  it("reuses the native provider's existing session without another login", async () => {
    setSession(session);
    expect(await getDataAppSession(store)(jwtConfig)).toEqual(session);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it("coordinates concurrent refreshes with the native SSO implementation", async () => {
    setSession({ id: "expired", exp: 1 });
    fetchMock.get(jwtConfig.jwtProviderUri + "?response=json", {
      jwt: "user-jwt",
    });
    fetchMock.post(instance + "/auth/sso", session);

    const getSession = getDataAppSession(store);
    expect(
      await Promise.all([getSession(jwtConfig), getSession(jwtConfig)]),
    ).toEqual([session, session]);
    expect(fetchMock.callHistory.calls(instance + "/auth/sso")).toHaveLength(1);
    expect(await getSession(jwtConfig)).toEqual(session);
    expect(fetchMock.callHistory.calls(instance + "/auth/sso")).toHaveLength(1);
  });

  it("uses and caches the existing SAML popup flow", async () => {
    fetchMock.get(instance + "/auth/sso?preferred_method=saml", {
      method: "saml",
      url: "https://idp.example.com",
      "saml-popup-url": instance,
    });
    jest.mocked(openSamlLoginPopup).mockResolvedValue(session);
    const getSession = getDataAppSession(store);
    const config = {
      metabaseInstanceUrl: instance,
      preferredAuthMethod: "saml" as const,
    };

    expect(await getSession(config)).toEqual(session);
    expect(await getSession(config)).toEqual(session);
    expect(openSamlLoginPopup).toHaveBeenCalledTimes(1);
  });

  it.each([{ apiKey: "secret" }, { isGuest: true as const }])(
    "rejects non-SSO providers before using a session: %p",
    async (auth) => {
      setSession(session);
      await expect(
        getDataAppSession(store)({ metabaseInstanceUrl: instance, ...auth }),
      ).rejects.toThrow("Data app embeds require SSO authentication.");
    },
  );
});
