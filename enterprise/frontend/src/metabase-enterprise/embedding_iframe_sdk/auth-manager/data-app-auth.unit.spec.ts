import fetchMock from "fetch-mock";

import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import { MetabaseDataAppElement } from "metabase/embedding/embedding-iframe-sdk/embed";
import { PLUGIN_EMBED_JS_EE } from "metabase/embedding/embedding-iframe-sdk/plugin";
import { defer } from "metabase/utils/promise";

import { initializePlugins } from "../sdk-iframe-embedding-script-ee-plugins";

import { EmbedAuthManager } from "./AuthManager";

const INSTANCE_URL = "https://metabase.example.com/reports";

describe("metabase-data-app authentication replies", () => {
  const originalAuthManager = PLUGIN_EMBED_JS_EE.EmbedAuthManager;

  beforeEach(() => {
    initializePlugins();
  });

  afterEach(() => {
    document.body.replaceChildren();
    delete window.metabaseConfig;
    jest.restoreAllMocks();

    PLUGIN_EMBED_JS_EE.EmbedAuthManager = originalAuthManager;
  });

  async function setupPendingAuth() {
    const tokenRequest = defer<MetabaseEmbeddingSessionToken>();
    const requestStarted = defer<void>();

    const authenticate = jest.spyOn(EmbedAuthManager.prototype, "authenticate");

    window.metabaseConfig = {
      instanceUrl: INSTANCE_URL,
      jwtProviderUri: "https://host.example.com/sso",
    };

    fetchMock.get("https://host.example.com/sso?response=json", {
      jwt: "signed-token",
    });

    fetchMock.post(`${INSTANCE_URL}/auth/sso`, () => {
      requestStarted.resolve();

      return tokenRequest.promise;
    });

    const element = new MetabaseDataAppElement();
    element.setAttribute("path", "sales/orders");
    document.body.appendChild(element);

    const iframe = element.querySelector("iframe")!;
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        origin: new URL(INSTANCE_URL).origin,
        data: { type: "metabase.embed.requestSessionToken" },
      }),
    );

    await requestStarted.promise;

    expect(authenticate).toHaveBeenCalledTimes(1);

    return {
      element,
      iframe,
      postMessage,
      tokenRequest,
      authentication: authenticate.mock.results[0].value,
    };
  }

  const SESSION_TOKEN: MetabaseEmbeddingSessionToken = {
    id: "session",
    exp: 123,
  };

  it("sends the session token to the iframe", async () => {
    const { postMessage, tokenRequest, authentication } =
      await setupPendingAuth();

    expect(postMessage).not.toHaveBeenCalled();

    tokenRequest.resolve(SESSION_TOKEN);
    await authentication;

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "metabase.embed.submitSessionToken",
        data: { authMethod: "jwt", sessionToken: SESSION_TOKEN },
      },
      "https://metabase.example.com",
    );
  });

  it("discards a pending session token after path changes", async () => {
    const { element, iframe, postMessage, tokenRequest, authentication } =
      await setupPendingAuth();

    element.setAttribute("path", "sales/customers");

    // iframe gets replaced after path changes
    const nextIframe = element.querySelector("iframe")!;
    const nextIframePostMessage = jest.spyOn(
      nextIframe.contentWindow!,
      "postMessage",
    );

    expect(nextIframe).not.toBe(iframe);

    tokenRequest.resolve(SESSION_TOKEN);
    await authentication;
    expect(postMessage).not.toHaveBeenCalled();
    expect(nextIframePostMessage).not.toHaveBeenCalled();
  });
});
