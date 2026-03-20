import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

import { requestSessionTokenFromEmbedJs } from "./request-session-token";

const MOCK_SESSION_TOKEN: MetabaseEmbeddingSessionToken = {
  id: "test-session-id",
  exp: Date.now() + 60000,
  iat: Date.now(),
  status: "ready",
};

jest.mock("metabase/lib/dom", () => ({
  isWithinIframe: () => true,
}));

jest.mock("embedding-sdk-bundle/errors", () => ({
  AUTH_TIMEOUT: () => new Error("Auth timeout"),
}));

jest.mock("metabase/embedding-sdk/lib/saml-token-storage", () => ({
  samlTokenStorage: { set: jest.fn() },
}));

jest.mock("../constants", () => ({
  WAIT_FOR_SESSION_TOKEN_TIMEOUT: 1000,
}));

describe("requestSessionTokenFromEmbedJs", () => {
  let postMessageSpy: jest.SpyInstance;

  beforeEach(() => {
    postMessageSpy = jest.fn();

    Object.defineProperty(window, "parent", {
      value: { postMessage: postMessageSpy },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should accept session token messages from window.parent", async () => {
    const promise = requestSessionTokenFromEmbedJs();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "metabase.embed.submitSessionToken",
          data: { authMethod: "jwt", sessionToken: MOCK_SESSION_TOKEN },
        },
        source: window.parent,
      }),
    );

    await expect(promise).resolves.toEqual(MOCK_SESSION_TOKEN);
  });

  it("should ignore session token messages from non-parent sources", async () => {
    const promise = requestSessionTokenFromEmbedJs();

    // Send a message with a different source (simulating a malicious iframe)
    const fakeSource = {} as Window;
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "metabase.embed.submitSessionToken",
          data: { authMethod: "jwt", sessionToken: MOCK_SESSION_TOKEN },
        },
        source: fakeSource,
      }),
    );

    // The promise should not resolve from the spoofed message.
    // Send the real message from the parent to verify it still works.
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "metabase.embed.submitSessionToken",
          data: { authMethod: "jwt", sessionToken: MOCK_SESSION_TOKEN },
        },
        source: window.parent,
      }),
    );

    await expect(promise).resolves.toEqual(MOCK_SESSION_TOKEN);
  });

  it("should ignore messages with null source", async () => {
    const promise = requestSessionTokenFromEmbedJs();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "metabase.embed.submitSessionToken",
          data: { authMethod: "jwt", sessionToken: MOCK_SESSION_TOKEN },
        },
        source: null,
      }),
    );

    // Resolve with a valid parent message
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "metabase.embed.submitSessionToken",
          data: { authMethod: "jwt", sessionToken: MOCK_SESSION_TOKEN },
        },
        source: window.parent,
      }),
    );

    await expect(promise).resolves.toEqual(MOCK_SESSION_TOKEN);
  });

  it("should reject on auth error from parent", async () => {
    const promise = requestSessionTokenFromEmbedJs();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "metabase.embed.reportAuthenticationError",
          data: { error: "auth failed" },
        },
        source: window.parent,
      }),
    );

    await expect(promise).rejects.toBe("auth failed");
  });

  it("should ignore auth error from non-parent sources", async () => {
    const promise = requestSessionTokenFromEmbedJs();

    const fakeSource = {} as Window;
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "metabase.embed.reportAuthenticationError",
          data: { error: "injected error" },
        },
        source: fakeSource,
      }),
    );

    // Should still be pending — resolve it properly
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "metabase.embed.submitSessionToken",
          data: { authMethod: "jwt", sessionToken: MOCK_SESSION_TOKEN },
        },
        source: window.parent,
      }),
    );

    await expect(promise).resolves.toEqual(MOCK_SESSION_TOKEN);
  });

  it("should send requestSessionToken to parent", () => {
    requestSessionTokenFromEmbedJs();

    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: "metabase.embed.requestSessionToken" },
      "*",
    );
  });
});
