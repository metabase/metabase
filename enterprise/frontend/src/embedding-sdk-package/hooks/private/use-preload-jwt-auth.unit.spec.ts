import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  validateSession,
} from "embedding/auth-common";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

import {
  getJwtAuthBridgeState,
  getJwtAuthRequestSignature,
  resetJwtAuthBridgeState,
} from "embedding-sdk-shared/lib/sdk-auth-bridge";

import { startPackageJwtAuth } from "./use-preload-jwt-auth";

jest.mock("embedding/auth-common", () => ({
  connectToInstanceAuthSso: jest.fn(),
  jwtDefaultRefreshTokenFunction: jest.fn(),
  validateSession: jest.fn(),
}));

const AUTH_CONFIG = {
  metabaseInstanceUrl: "https://example.metabase.com",
  preferredAuthMethod: "jwt" as const,
  fetchRequestToken: undefined,
};

const sessionToken = { id: "jwt-token" } as MetabaseEmbeddingSessionToken;

describe("startPackageJwtAuth", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetJwtAuthBridgeState();

    (connectToInstanceAuthSso as jest.Mock).mockResolvedValue({
      method: "jwt",
      url: "https://example.metabase.com/auth",
    });
    (jwtDefaultRefreshTokenFunction as jest.Mock).mockResolvedValue(
      sessionToken,
    );
  });

  it("stores the resolved token on the auth bridge", async () => {
    await startPackageJwtAuth(AUTH_CONFIG);

    const state = getJwtAuthBridgeState();

    expect(state.status).toBe("fulfilled");
    expect(state.token).toEqual(sessionToken);
    expect(validateSession).toHaveBeenCalledWith(sessionToken);
  });

  it("does not start a new request when the signature matches and is already pending", async () => {
    const promise = startPackageJwtAuth(AUTH_CONFIG);

    expect(connectToInstanceAuthSso).toHaveBeenCalledTimes(1);

    await promise;

    await startPackageJwtAuth(AUTH_CONFIG);

    expect(connectToInstanceAuthSso).toHaveBeenCalledTimes(1);
  });

  it("marks the bridge state as rejected when the method is not jwt", async () => {
    (connectToInstanceAuthSso as jest.Mock).mockResolvedValue({
      method: "saml",
      url: "https://example.metabase.com/auth",
    });

    await expect(startPackageJwtAuth(AUTH_CONFIG)).rejects.toThrow();

    const state = getJwtAuthBridgeState();

    expect(state.status).toBe("rejected");
    expect(state.token).toBeNull();
    expect(state.configSignature).toBe(
      getJwtAuthRequestSignature({
        metabaseInstanceUrl: AUTH_CONFIG.metabaseInstanceUrl,
        preferredAuthMethod: AUTH_CONFIG.preferredAuthMethod,
      }),
    );
  });
});


