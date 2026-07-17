import fetchMock from "fetch-mock";

import { setupBasename } from "__support__/basename";
import {
  _resetCapturedEmbedderOriginForTests,
  captureEmbedderOriginFromEvent,
} from "metabase/embedding-sdk/embedder-origin";

import {
  finalizeHostedSignedAttempt,
  findSandboxIframeBySrc,
  getEmbedderOrigin,
  mintSandboxHostEajsUrl,
  probeSandboxEval,
  scrubSandboxHostToken,
  verifySandboxIframeWithRetry,
} from "./index";

function setReferrer(value: string) {
  Object.defineProperty(document, "referrer", {
    value,
    configurable: true,
  });
}

function appendIframe(src: string | null): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  if (src != null) {
    iframe.setAttribute("src", src);
  }
  document.body.appendChild(iframe);
  return iframe;
}

function fakeEnv(evaluate: (code: string) => unknown = jest.fn()) {
  return { evaluate: jest.fn(evaluate) };
}

afterEach(() => {
  document.querySelectorAll("iframe").forEach((el) => el.remove());
  setReferrer("");
  _resetCapturedEmbedderOriginForTests();
});

// jsdom is not inside an iframe, so window.parent === window and a
// same-window MessageEvent passes the parent-source guard.
function captureOriginFromParentMessage(origin: string) {
  captureEmbedderOriginFromEvent(
    new MessageEvent("message", { origin, source: window }),
  );
}

describe("getEmbedderOrigin", () => {
  it("prefers the origin captured from the parent's message event", () => {
    setReferrer("https://referrer.example/page");
    captureOriginFromParentMessage("https://captured.example");
    expect(getEmbedderOrigin()).toBe("https://captured.example");
  });

  it("works without a referrer when an origin was captured", () => {
    setReferrer("");
    captureOriginFromParentMessage("https://captured.example");
    expect(getEmbedderOrigin()).toBe("https://captured.example");
  });

  it("ignores messages that are not from the parent window", () => {
    setReferrer("");
    captureEmbedderOriginFromEvent(
      new MessageEvent("message", {
        origin: "https://attacker.example",
        source: null,
      }),
    );
    expect(() => getEmbedderOrigin()).toThrow();
  });

  it("ignores opaque origins from the parent window", () => {
    setReferrer("");
    captureOriginFromParentMessage("null");
    expect(() => getEmbedderOrigin()).toThrow();
  });

  it("falls back to the origin of document.referrer", () => {
    setReferrer("https://customer.example/dashboard?foo=bar");
    expect(getEmbedderOrigin()).toBe("https://customer.example");
  });

  it("throws when neither a captured origin nor a referrer is available", () => {
    setReferrer("");
    expect(() => getEmbedderOrigin()).toThrow();
  });
});

describe("mintSandboxHostEajsUrl", () => {
  setupBasename();

  afterEach(() => {
    fetchMock.removeRoutes().clearHistory();
  });

  it("posts the embedder origin and returns the signed url", async () => {
    setReferrer("https://customer.example/dashboard");
    fetchMock.post("path:/api/ee/custom-viz-plugin/sandbox-host-eajs/sign", {
      url: "/api/ee/custom-viz-plugin/sandbox-host-eajs?token=abc",
    });

    const url = await mintSandboxHostEajsUrl();

    expect(url).toBe("/api/ee/custom-viz-plugin/sandbox-host-eajs?token=abc");
    const call = fetchMock.callHistory.lastCall();
    expect(JSON.parse(String(call?.options?.body))).toEqual({
      origin: "https://customer.example",
    });
  });

  it("throws when the sign endpoint responds with a non-2xx status", async () => {
    setReferrer("https://customer.example/dashboard");
    fetchMock.post(
      "path:/api/ee/custom-viz-plugin/sandbox-host-eajs/sign",
      400,
    );

    await expect(mintSandboxHostEajsUrl()).rejects.toThrow();
  });

  it("throws when the response body has no url", async () => {
    setReferrer("https://customer.example/dashboard");
    fetchMock.post("path:/api/ee/custom-viz-plugin/sandbox-host-eajs/sign", {});

    await expect(mintSandboxHostEajsUrl()).rejects.toThrow();
  });
});

describe("findSandboxIframeBySrc", () => {
  it("finds the iframe with a matching src attribute", () => {
    appendIframe("/other");
    const target = appendIframe(
      "/api/ee/custom-viz-plugin/sandbox-host-eajs?token=xyz",
    );

    expect(
      findSandboxIframeBySrc(
        "/api/ee/custom-viz-plugin/sandbox-host-eajs?token=xyz",
      ),
    ).toBe(target);
  });

  it("returns undefined when no iframe matches", () => {
    appendIframe("/other");
    expect(findSandboxIframeBySrc("/does-not-exist")).toBeUndefined();
  });

  it("returns the most recently appended match when duplicates exist", () => {
    appendIframe("/dup");
    const latest = appendIframe("/dup");
    expect(findSandboxIframeBySrc("/dup")).toBe(latest);
  });
});

describe("probeSandboxEval", () => {
  it("returns true when env.evaluate succeeds (real donor: CSP allows unsafe-eval)", () => {
    const env = fakeEnv();
    expect(probeSandboxEval(env)).toBe(true);
    expect(env.evaluate).toHaveBeenCalledWith("1");
  });

  it("returns false when env.evaluate throws (wrong document: CSP blocks eval)", () => {
    const env = fakeEnv(() => {
      throw new EvalError("Refused to evaluate a string as JavaScript");
    });
    expect(probeSandboxEval(env)).toBe(false);
  });
});

describe("scrubSandboxHostToken", () => {
  it("replaces the iframe location with the token-less donor path", () => {
    const iframe = appendIframe("/donor?token=secret");
    const replaceState = jest.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { history: { replaceState } },
      configurable: true,
    });

    scrubSandboxHostToken(iframe);

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/api/ee/custom-viz-plugin/sandbox-host-eajs",
    );
  });

  it("does not throw when contentWindow access fails", () => {
    const iframe = appendIframe("/donor?token=secret");
    Object.defineProperty(iframe, "contentWindow", {
      get() {
        throw new Error("cross-origin");
      },
    });
    expect(() => scrubSandboxHostToken(iframe)).not.toThrow();
  });
});

describe("finalizeHostedSignedAttempt", () => {
  it("scrubs the token and returns the env when the probe succeeds", () => {
    const env = fakeEnv();
    const iframe = appendIframe("/donor?token=secret");
    const replaceState = jest.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { history: { replaceState } },
      configurable: true,
    });

    expect(finalizeHostedSignedAttempt(env, iframe)).toBe(env);
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/api/ee/custom-viz-plugin/sandbox-host-eajs",
    );
    // The iframe stays: it's the sandbox realm the caller keeps using.
    expect(document.body.contains(iframe)).toBe(true);
  });

  it("removes the iframe and returns null when the probe fails", () => {
    const env = fakeEnv(() => {
      throw new EvalError("blocked");
    });
    const iframe = appendIframe("/donor?token=secret");

    expect(finalizeHostedSignedAttempt(env, iframe)).toBeNull();
    expect(document.body.contains(iframe)).toBe(false);
  });

  it("returns null without throwing when the probe fails and no iframe was found", () => {
    const env = fakeEnv(() => {
      throw new EvalError("blocked");
    });

    expect(finalizeHostedSignedAttempt(env, undefined)).toBeNull();
  });

  it("fails closed (throws) when the probe succeeds but no iframe was found", () => {
    const env = fakeEnv();
    expect(() => finalizeHostedSignedAttempt(env, undefined)).toThrow();
  });
});

describe("verifySandboxIframeWithRetry", () => {
  it("returns the env on the first attempt when it verifies", async () => {
    const env = fakeEnv();
    const attemptFn = jest.fn().mockResolvedValue(env);

    await expect(verifySandboxIframeWithRetry(attemptFn)).resolves.toBe(env);
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it("retries once after a null (probe-failed) result, then succeeds", async () => {
    const env = fakeEnv();
    const attemptFn = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(env);

    await expect(verifySandboxIframeWithRetry(attemptFn)).resolves.toBe(env);
    expect(attemptFn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries when the attempt never verifies", async () => {
    const attemptFn = jest.fn().mockResolvedValue(null);

    await expect(verifySandboxIframeWithRetry(attemptFn)).rejects.toThrow();
    expect(attemptFn).toHaveBeenCalledTimes(2);
  });

  it("propagates an attemptFn failure immediately, without retrying", async () => {
    const attemptFn = jest.fn().mockRejectedValue(new Error("mint failed"));

    await expect(verifySandboxIframeWithRetry(attemptFn)).rejects.toThrow(
      "mint failed",
    );
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });
});
