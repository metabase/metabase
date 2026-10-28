import { MetabaseDataAppElement } from "./embed";
import { PLUGIN_EMBED_JS_EE } from "./plugin";
import type { EmbedAuthManagerContext } from "./types/auth-manager";

const INSTANCE_URL = "https://metabase.example.com/reports";

describe("metabase-data-app", () => {
  let consoleError: jest.SpyInstance;
  const originalAuthManager = PLUGIN_EMBED_JS_EE.EmbedAuthManager;
  const contexts: EmbedAuthManagerContext[] = [];

  beforeEach(() => {
    contexts.length = 0;
    PLUGIN_EMBED_JS_EE.EmbedAuthManager = class {
      constructor(context: EmbedAuthManagerContext) {
        contexts.push(context);
      }
      async authenticate() {}
    };

    window.metabaseConfig = { instanceUrl: INSTANCE_URL };
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.replaceChildren();
    delete window.metabaseConfig;
    consoleError.mockRestore();
    PLUGIN_EMBED_JS_EE.EmbedAuthManager = originalAuthManager;
  });

  const setup = (path = "/sales/orders?active=true#details") => {
    const element = new MetabaseDataAppElement();
    element.setAttribute("path", path);
    document.body.appendChild(element);

    return element;
  };

  const ready = (
    iframe: HTMLIFrameElement,
    origin = new URL(INSTANCE_URL).origin,
  ) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        origin,
        data: { type: "metabase.embed.iframeReady" },
      }),
    );
  };

  it("registers the element and preserves nested routes, query, hash and instance subpath", () => {
    const element = setup();
    const iframe = element.querySelector("iframe")!;
    const url = new URL(iframe.src);

    expect(customElements.get("metabase-data-app")).toBe(
      MetabaseDataAppElement,
    );
    expect(url.pathname).toBe("/reports/embed/embedded-apps/sales/orders");
    expect(url.searchParams.get("active")).toBe("true");
    expect(url.searchParams.has("embed-js-identifier")).toBe(true);
    expect(url.hash).toBe("#details");

    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");
    ready(iframe);

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "metabase.embed.setSettings",
        data: expect.objectContaining({
          componentName: "metabase-data-app",
          path: "sales/orders?active=true#details",
        }),
      },
      "https://metabase.example.com",
    );
  });

  it("ignores other frames and unexpected origins", () => {
    const element = setup();
    const iframe = element.querySelector("iframe")!;
    const other = setup("other").querySelector("iframe")!;
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    ready(iframe, "https://attacker.example.com");
    ready(other);

    expect(postMessage).not.toHaveBeenCalled();

    ready(iframe);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("preserves the frame when only leading slashes change and remounts for a new path", () => {
    const element = setup("/sales/orders");
    const original = element.querySelector("iframe")!;

    element.setAttribute("path", "///sales/orders");
    expect(element.querySelector("iframe")).toBe(original);

    element.setAttribute("path", "sales/customers");
    expect(element.querySelector("iframe")).not.toBe(original);
    expect(element.querySelector("iframe")?.src).toContain("/sales/customers?");
  });

  it("assigns distinct identifiers to concurrent frames", () => {
    const first = new URL(setup().querySelector("iframe")!.src);
    const second = new URL(setup().querySelector("iframe")!.src);

    expect(first.searchParams.get("embed-js-identifier")).not.toBe(
      second.searchParams.get("embed-js-identifier"),
    );
  });

  it.each([
    "",
    "sales/../other",
    "sales/%2fother",
    "sales/%00",
    "sales/%",
    "sales/\\other",
  ])("rejects unsafe paths: %s", (path) => {
    const element = setup(path);

    expect(element.querySelector("iframe")).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it.each([
    { isGuest: true },
    { apiKey: "secret" },
    { useExistingUserSession: true },
    { guestEmbedProviderUri: "/guest" },
  ])("rejects unsupported authentication: %p", (config) => {
    window.metabaseConfig = { instanceUrl: INSTANCE_URL, ...config };
    const element = setup();

    expect(element.querySelector("iframe")).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it("discards pending authentication replies after path changes and removal", () => {
    const element = setup("sales/orders");
    const initialContext = contexts[0];

    element.setAttribute("path", "sales/customers");
    const iframe = element.querySelector("iframe")!;
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    const session = {
      authMethod: "jwt" as const,
      sessionToken: { id: "session", exp: 123, iat: 100 },
    };
    initialContext.sendMessage("metabase.embed.submitSessionToken", session);
    expect(postMessage).not.toHaveBeenCalled();

    contexts[1].sendMessage("metabase.embed.submitSessionToken", session);
    expect(postMessage).toHaveBeenCalledWith(
      { type: "metabase.embed.submitSessionToken", data: session },
      "https://metabase.example.com",
    );

    postMessage.mockClear();
    element.remove();
    contexts[1].sendMessage("metabase.embed.submitSessionToken", session);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("removes the frame and message listener on disconnect", () => {
    const element = setup();
    const iframe = element.querySelector("iframe")!;
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    element.remove();
    ready(iframe);

    expect(element.querySelector("iframe")).toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
