import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

import {
  getJwtAuthBridgeState,
  getJwtAuthRequestSignature,
  resetJwtAuthBridgeState,
} from "embedding-sdk-shared/lib/sdk-auth-bridge";

import {
  PRELOADED_JWT_WAIT_TIMEOUT_MS,
  consumePreloadedJwtToken,
} from "./preloaded-jwt";

const CONFIG = {
  metabaseInstanceUrl: "https://example.metabase.com",
  preferredAuthMethod: "jwt" as const,
};

describe("consumePreloadedJwtToken", () => {
  beforeEach(() => {
    resetJwtAuthBridgeState();
  });

  it("returns null when preferredAuthMethod is not jwt", async () => {
    await expect(
      consumePreloadedJwtToken({
        metabaseInstanceUrl: CONFIG.metabaseInstanceUrl,
        preferredAuthMethod: "saml",
      }),
    ).resolves.toBeNull();
  });

  it("returns token immediately when bridge state is fulfilled", async () => {
    const state = getJwtAuthBridgeState();
    const token = { id: "jwt-token" } as MetabaseEmbeddingSessionToken;

    Object.assign(state, {
      status: "fulfilled" as const,
      token,
      method: "jwt" as const,
      configSignature: getJwtAuthRequestSignature(CONFIG),
    });

    await expect(consumePreloadedJwtToken(CONFIG)).resolves.toEqual(token);
  });

  it("waits for a pending promise and returns the resolved token", async () => {
    const state = getJwtAuthBridgeState();
    const token = { id: "jwt-token" } as MetabaseEmbeddingSessionToken;
    let resolvePromise!: (value: MetabaseEmbeddingSessionToken) => void;

    state.configSignature = getJwtAuthRequestSignature(CONFIG);
    state.status = "pending";
    state.method = "jwt";
    state.promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    const tokenPromise = consumePreloadedJwtToken(CONFIG);

    resolvePromise(token);

    await expect(tokenPromise).resolves.toEqual(token);
  });

  it("returns null when pending promise times out", async () => {
    jest.useFakeTimers();
    const state = getJwtAuthBridgeState();

    state.configSignature = getJwtAuthRequestSignature(CONFIG);
    state.status = "pending";
    state.method = "jwt";
    state.promise = new Promise(() => {});

    const tokenPromise = consumePreloadedJwtToken(CONFIG);

    jest.advanceTimersByTime(PRELOADED_JWT_WAIT_TIMEOUT_MS + 1);

    await expect(tokenPromise).resolves.toBeNull();
    jest.useRealTimers();
  });
});


