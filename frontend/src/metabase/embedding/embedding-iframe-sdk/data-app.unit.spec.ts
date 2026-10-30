import { MetabaseDataAppElement } from "./embed";

const INSTANCE_URL = "https://gizmo.example.com/mb";

describe("metabase-data-app", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    window.metabaseConfig = { instanceUrl: INSTANCE_URL };
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.replaceChildren();
    delete window.metabaseConfig;
    consoleError.mockRestore();
  });

  const setup = (path = "/sales/orders?active=true") => {
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
        origin,
        source: iframe.contentWindow,
        data: { type: "metabase.embed.iframeReady" },
      }),
    );
  };

  it("loads the data app route and sends settings to its origin", () => {
    const element = setup();
    const iframe = element.querySelector("iframe")!;

    const url = new URL(iframe.src);
    url.searchParams.delete("embed-js-identifier");

    expect(url.href).toBe(
      `${INSTANCE_URL}/embed/embedded-apps/sales/orders?active=true`,
    );

    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");
    ready(iframe);

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "metabase.embed.setSettings",
        data: expect.objectContaining({
          componentName: "metabase-data-app",
          path: "/sales/orders?active=true",
        }),
      },
      "https://gizmo.example.com",
    );
  });

  it("ignores messages from an unexpected iframe origin", () => {
    const element = setup();
    const iframe = element.querySelector("iframe")!;
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    ready(iframe, "https://attacker.example.com");
    expect(postMessage).not.toHaveBeenCalled();

    ready(iframe);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("loads the path by assigning the path property", () => {
    const element = new MetabaseDataAppElement();

    // property is different from attribute in web components.
    // modular embedding supports both property and attribute.
    element.path = "sales/orders?active=true#details";

    document.body.appendChild(element);
    expect(element).toHaveAttribute("path", "sales/orders?active=true#details");

    const url = new URL(element.querySelector("iframe")!.src);
    url.searchParams.delete("embed-js-identifier");

    expect(url.href).toBe(
      `${INSTANCE_URL}/embed/embedded-apps/sales/orders?active=true#details`,
    );
  });

  it("updates the path attribute and remounts after a property change", () => {
    const element = setup("sales/orders");
    expect(element.path).toBe("sales/orders");

    const original = element.querySelector("iframe")!;
    element.path = "franchises/products";

    expect(element.path).toBe("franchises/products");

    // attribute is updated after the property change
    expect(element).toHaveAttribute("path", "franchises/products");

    // iframe remounts after the path change
    expect(element.querySelector("iframe")).not.toBe(original);

    expect(element.querySelector("iframe")?.src).toContain(
      "/franchises/products?",
    );
  });

  it("rejects an invalid data app path", () => {
    const element = setup("sales/../other");

    expect(element.querySelector("iframe")).toBeNull();

    expect(consoleError).toHaveBeenCalledWith(
      "[metabase.embed.error]",
      expect.objectContaining({
        message: "A valid data app path must be provided.",
      }),
    );
  });

  it.each([
    { isGuest: true },
    { apiKey: "secret" },
    { useExistingUserSession: true },
    { guestEmbedProviderUri: "/guest" },
  ])("rejects unsupported auth methods: %p", (config) => {
    window.metabaseConfig = { instanceUrl: INSTANCE_URL, ...config };
    const element = setup();
    expect(element.querySelector("iframe")).toBeNull();

    expect(consoleError).toHaveBeenCalledWith(
      "[metabase.embed.error]",
      expect.objectContaining({
        message: "Data apps require SSO authentication.",
      }),
    );
  });

  it("removes iframe and message listener on disconnect", () => {
    const element = setup();
    const iframe = element.querySelector("iframe")!;
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    element.remove();
    ready(iframe);

    expect(element.querySelector("iframe")).toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("replaces the iframe only when the app name changed", () => {
    const element = setup("/sales/orders");
    const original = element.querySelector("iframe")!;

    element.setAttribute("path", "///sales/orders");
    expect(element.querySelector("iframe")).toBe(original);

    const postMessage = jest.spyOn(original.contentWindow!, "postMessage");
    ready(original);

    // app name remains the same (sales), so iframe should not be replaced
    element.setAttribute("path", "sales/customers?active=true");
    expect(element.querySelector("iframe")).toBe(original);

    expect(postMessage).toHaveBeenLastCalledWith(
      {
        type: "metabase.embed.setSettings",
        data: expect.objectContaining({
          path: "sales/customers?active=true",
        }),
      },
      new URL(INSTANCE_URL).origin,
    );

    // app name has changed (sales -> franchises), so iframe should be replaced
    element.setAttribute("path", "franchises/products");
    expect(element.querySelector("iframe")).not.toBe(original);

    expect(element.querySelector("iframe")?.src).toContain(
      "/franchises/products?",
    );
  });
});
