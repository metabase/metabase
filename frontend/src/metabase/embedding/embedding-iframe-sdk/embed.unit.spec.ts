import fetchMock from "fetch-mock";
import jwt from "jsonwebtoken";
import { act } from "react-dom/test-utils";

import { MetabaseEmbedElement } from "./embed";

const defineMetabaseConfig = (config: unknown) => {
  (window as any).metabaseConfig = config;
};

describe("embed.js script tag for sdk iframe embedding", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    delete window.metabaseConfig;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- require after jest.resetModules
    require("./embed"); // we do things when the script is loaded

    document.body.innerHTML = "";
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("reports an error when instance url is not provided", () => {
    const embed = document.createElement("metabase-question");
    embed.setAttribute("question-id", "1");
    document.body.appendChild(embed);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[metabase.embed.error]",
      expect.objectContaining({
        message: "instanceUrl must be provided",
      }),
    );
  });

  it("does not report an error when instanceUrl is updated to be the same", () => {
    defineMetabaseConfig({
      instanceUrl: "https://foo-bar-baz.com",
    });
    const embed = document.createElement("metabase-question");
    embed.setAttribute("question-id", "10");
    document.body.appendChild(embed);

    defineMetabaseConfig({
      instanceUrl: "https://foo-bar-baz.com",
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("reports an error when useExistingUserSession is updated to be a different value", async () => {
    defineMetabaseConfig({
      instanceUrl: "https://foo-bar-baz.com",
      useExistingUserSession: true,
    });
    const embed = document.createElement("metabase-question");
    embed.setAttribute("question-id", "10");

    await act(async () => {
      document.body.appendChild(embed);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(() => {
      defineMetabaseConfig({
        instanceUrl: "https://foo-bar-baz.com",
        useExistingUserSession: false,
      });
    }).toThrow(
      "useExistingUserSession cannot be updated after the embed is created",
    );
  });

  it("fires ready event immediately when addEventListener is called when embed is ready", () => {
    const readyHandler = jest.fn();

    defineMetabaseConfig({
      instanceUrl: "http://localhost:3000",
    });
    const embed = document.createElement("metabase-dashboard");
    embed.setAttribute("dashboard-id", "1");
    document.body.appendChild(embed);

    // @ts-expect-error -- Simulate the embed being ready.
    (embed as MetabaseEmbedElement)._isEmbedReady = true;

    // The handler should be called immediately.
    embed.addEventListener("ready", readyHandler);
    expect(readyHandler).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  const authErrorTestCases = [
    { apiKey: "test-key", useExistingUserSession: true },
    { apiKey: "test-key", preferredAuthMethod: "jwt" },
    { useExistingUserSession: true, preferredAuthMethod: "jwt" },
    {
      apiKey: "test-key",
      useExistingUserSession: true,
      preferredAuthMethod: "jwt",
    },
  ].flatMap((authConfig) => [
    { ...authConfig, dashboardId: 1 },
    { ...authConfig, questionId: 1 },
  ]);

  it.each(authErrorTestCases)(
    "reports an error when auth methods are not mutually exclusive for %p",
    (settings) => {
      const { questionId, dashboardId, ...config } = settings as Partial<
        typeof settings
      > & {
        questionId?: number;
        dashboardId?: number;
      };
      defineMetabaseConfig({
        instanceUrl: "http://localhost:3000",
        ...config,
      });

      const tagName = questionId ? "metabase-question" : "metabase-dashboard";
      const embed = document.createElement(tagName);
      if (questionId) {
        embed.setAttribute("question-id", String(questionId));
      } else if (dashboardId) {
        embed.setAttribute("dashboard-id", String(dashboardId));
      }
      document.body.appendChild(embed);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[metabase.embed.error]",
        expect.objectContaining({
          message:
            "apiKey, useExistingUserSession, and preferredAuthMethod are mutually exclusive, only one can be specified.",
        }),
      );
    },
  );

  const singleAuthTestCases = [
    { apiKey: "test-key" },
    { useExistingUserSession: true },
    { preferredAuthMethod: "jwt" },
  ].flatMap((authConfig) => [
    { ...authConfig, dashboardId: 1 },
    { ...authConfig, questionId: 1 },
  ]);

  it.each(singleAuthTestCases)(
    "does not report an error when only one auth method is provided for %p",
    (settings) => {
      const { questionId, dashboardId, ...config } = settings as Partial<
        typeof settings
      > & {
        questionId?: number;
        dashboardId?: number;
      };
      defineMetabaseConfig({
        instanceUrl: "http://localhost:3000",
        ...config,
      });

      const tagName = questionId ? "metabase-question" : "metabase-dashboard";
      const embed = document.createElement(tagName);
      if (questionId) {
        embed.setAttribute("question-id", String(questionId));
      } else if (dashboardId) {
        embed.setAttribute("dashboard-id", String(dashboardId));
      }
      document.body.appendChild(embed);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    },
  );

  it("should throw for multiple invalid keys and report the first one", () => {
    expect(() => {
      defineMetabaseConfig({
        invalidKey1: "value1",
        invalidKey2: "value2",
      } as any);
    }).toThrow("invalidKey1 is not a valid configuration name");
  });

  it("should not throw for valid config", () => {
    expect(() => {
      defineMetabaseConfig({ instanceUrl: "https://example.com" });
      defineMetabaseConfig({});
    }).not.toThrow();
  });

  it("should include a component id as a query parameter in the iframe src for parallel loading", () => {
    defineMetabaseConfig({
      instanceUrl: "https://example.com",
    });

    const embed = document.createElement("metabase-dashboard");
    embed.setAttribute("dashboard-id", "1");
    document.body.appendChild(embed);

    const iframe = embed.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toMatch(
      /^https:\/\/example\.com\/embed\/sdk\/v1\?embed-js-identifier=\d+$/,
    );
  });

  describe("guest embed token provider", () => {
    // Wait for all fetch mocks, and async/await to finish
    const flushPromises = () =>
      new Promise<void>((resolve) => setTimeout(resolve, 0));

    function setupGuestEmbed({
      dashboardId,
      token,
      customContext,
    }: {
      dashboardId: string;
      token?: string;
      customContext?: string;
    }) {
      defineMetabaseConfig({
        instanceUrl: "http://localhost:3000",
        guestEmbedProviderUri: "/mock-provider",
      });

      const embed = document.createElement("metabase-dashboard");
      embed.setAttribute("dashboard-id", dashboardId);
      if (token) {
        embed.setAttribute("token", token);
      }
      if (customContext && embed instanceof MetabaseEmbedElement) {
        embed.setAttribute("custom-context", customContext);
      }
      document.body.appendChild(embed);

      const iframe = embed.querySelector("iframe") as HTMLIFrameElement;
      const iframePostMessageSpy = jest.spyOn(
        iframe.contentWindow!,
        "postMessage",
      );

      const triggerIframeMessage = (data: unknown) => {
        window.dispatchEvent(
          new MessageEvent("message", { data, source: iframe.contentWindow }),
        );
      };

      return { embed, iframe, iframePostMessageSpy, triggerIframeMessage };
    }

    describe("refresh token only (static token)", () => {
      it("skips provider fetch and sends setSettings directly with static token", async () => {
        const { triggerIframeMessage, iframePostMessageSpy } = setupGuestEmbed({
          dashboardId: "1",
          token: "static-jwt-token",
        });

        triggerIframeMessage({ type: "metabase.embed.iframeReady" });
        await flushPromises();

        expect(fetchMock.callHistory.calls("path:/mock-provider")).toHaveLength(
          0,
        );
        expect(iframePostMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "metabase.embed.setSettings",
            data: expect.objectContaining({ token: "static-jwt-token" }),
          }),
          "*",
        );
      });

      it("POSTs { entityType, entityId, customContext } to provider and sends submitRefreshedGuestToken", async () => {
        const expiredToken = jwt.sign(
          {
            resource: { dashboard: 1 },
            /**
             * 60 seconds ago. By the way, the expiration isn't verified here.
             * But why mock any other value when we're passing an expired token here.
             */
            exp: Math.floor(Date.now() / 1000) - 60,
          },
          "jwt-secret",
        );

        fetchMock.post("path:/mock-provider", { jwt: "refreshed-token" });

        const { triggerIframeMessage, iframePostMessageSpy } = setupGuestEmbed({
          dashboardId: "1",
          customContext: "my-context",
        });

        triggerIframeMessage({
          type: "metabase.embed.requestGuestTokenRefresh",
          data: { expiredToken },
        });
        await flushPromises();

        const call = fetchMock.callHistory.lastCall("path:/mock-provider");
        expect(call?.url).toContain("response=json");
        expect(call?.options).toMatchObject({
          method: "post",
          body: JSON.stringify({
            entityType: "dashboard",
            entityId: 1,
            customContext: "my-context",
          }),
        });

        expect(iframePostMessageSpy).toHaveBeenCalledWith(
          {
            type: "metabase.embed.submitRefreshedGuestToken",
            data: { guestToken: "refreshed-token" },
          },
          "*",
        );
      });

      it("sends reportAuthenticationError to iframe when provider returns HTTP error", async () => {
        fetchMock.post("path:/mock-provider", 403);

        const { triggerIframeMessage, iframePostMessageSpy } = setupGuestEmbed({
          dashboardId: "1",
        });

        triggerIframeMessage({
          type: "metabase.embed.requestGuestTokenRefresh",
          data: { expiredToken: "any.expired.token" },
        });
        await flushPromises();

        expect(iframePostMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "metabase.embed.reportAuthenticationError",
            data: {
              error: expect.objectContaining({
                code: "CANNOT_FETCH_JWT_TOKEN",
              }),
            },
          }),
          "*",
        );
      });

      it("sends reportAuthenticationError to iframe when provider returns invalid JSON shape", async () => {
        fetchMock.post("path:/mock-provider", { token: "wrong-field-name" });

        const { triggerIframeMessage, iframePostMessageSpy } = setupGuestEmbed({
          dashboardId: "1",
        });

        triggerIframeMessage({
          type: "metabase.embed.requestGuestTokenRefresh",
          data: { expiredToken: "any.expired.token" },
        });
        await flushPromises();

        expect(iframePostMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "metabase.embed.reportAuthenticationError",
            data: {
              error: expect.objectContaining({
                code: "DEFAULT_ENDPOINT_ERROR",
              }),
            },
          }),
          "*",
        );
      });
    });

    describe("initial token (no static token)", () => {
      it("fetches initial token from provider with { entityType, entityId, customContext } and sends setSettings", async () => {
        fetchMock.post("path:/mock-provider", { jwt: "initial-token" });

        const { triggerIframeMessage, iframePostMessageSpy } = setupGuestEmbed({
          dashboardId: "1",
          customContext: "my-context",
        });

        triggerIframeMessage({ type: "metabase.embed.iframeReady" });
        await flushPromises();

        const call = fetchMock.callHistory.lastCall("path:/mock-provider");
        expect(call?.url).toContain("response=json");
        expect(call?.options).toMatchObject({
          method: "post",
          body: JSON.stringify({
            entityType: "dashboard",
            entityId: 1,
            customContext: "my-context",
          }),
        });

        expect(iframePostMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "metabase.embed.setSettings",
            data: {
              token: "initial-token",
              // The rest of the properties
              instanceUrl: "http://localhost:3000",
              guestEmbedProviderUri: "/mock-provider",
              // dashboardId and questionId are not sent — the token already encodes the resource
              dashboardId: undefined,
              questionId: undefined,
              componentName: "metabase-dashboard",
              _isLocalhost: true,
              _embedReferrer: "http://localhost/",
            },
          }),
          "*",
        );
      });

      it("sends reportAuthenticationError when initial token fetch returns HTTP error", async () => {
        fetchMock.post("path:/mock-provider", 500);

        const { triggerIframeMessage, iframePostMessageSpy } = setupGuestEmbed({
          dashboardId: "1",
        });

        triggerIframeMessage({ type: "metabase.embed.iframeReady" });
        await flushPromises();

        expect(iframePostMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "metabase.embed.reportAuthenticationError",
            data: {
              error: expect.objectContaining({
                code: "CANNOT_FETCH_JWT_TOKEN",
              }),
            },
          }),
          "*",
        );

        expect(iframePostMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "metabase.embed.setSettings",
            data: expect.objectContaining({
              // dashboardId and questionId are not sent on error path either
              dashboardId: undefined,
              questionId: undefined,
            }),
          }),
          "*",
        );
      });

      it("sends reportAuthenticationError when initial token fetch returns invalid JSON shape", async () => {
        fetchMock.post("path:/mock-provider", { token: "wrong-field" });

        const { triggerIframeMessage, iframePostMessageSpy } = setupGuestEmbed({
          dashboardId: "1",
        });

        triggerIframeMessage({ type: "metabase.embed.iframeReady" });
        await flushPromises();

        expect(iframePostMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "metabase.embed.reportAuthenticationError",
            data: {
              error: expect.objectContaining({
                code: "DEFAULT_ENDPOINT_ERROR",
              }),
            },
          }),
          "*",
        );
      });
    });
  });
});
