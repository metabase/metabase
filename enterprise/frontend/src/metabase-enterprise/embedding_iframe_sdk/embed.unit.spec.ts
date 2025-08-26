import { act } from "react-dom/test-utils";

import type { MetabaseEmbedElement } from "./embed";

const defineMetabaseConfig = (config: unknown) => {
  (window as any).metabaseConfig = config;
};

describe("embed.js script tag for sdk iframe embedding", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    // @ts-expect-error -- test cleanup
    delete window.metabaseConfig;
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
});
