import { resolveAssetBaseUrl } from "./sdk-public-path";

const setCurrentScriptSrc = (src: string | undefined) => {
  // The code under test only reads `.src`, so a minimal stub stands in for a
  // real HTMLScriptElement here.
  const currentScript = src === undefined ? null : { src };

  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: currentScript,
  });
};

describe("resolveAssetBaseUrl", () => {
  afterEach(() => {
    delete window.METABASE_EMBEDDING_SDK_ASSET_BASE_URL;
    setCurrentScriptSrc(undefined);
  });

  it("prefers the base URL exposed on window by the bootstrap", () => {
    window.METABASE_EMBEDDING_SDK_ASSET_BASE_URL =
      "https://cdn.example.com/app/embedding-sdk/";
    setCurrentScriptSrc("https://cdn.example.com/app/embedding-sdk.js");

    expect(resolveAssetBaseUrl()).toBe(
      "https://cdn.example.com/app/embedding-sdk/",
    );
  });

  it("derives the base from the SDK entry script when no window value is set", () => {
    setCurrentScriptSrc("https://cdn.example.com/app/embedding-sdk.js");

    expect(resolveAssetBaseUrl()).toBe(
      "https://cdn.example.com/app/embedding-sdk/",
    );
  });

  it("derives the base from the SDK entry script with a query string", () => {
    setCurrentScriptSrc("https://cdn.example.com/app/embedding-sdk.js?v=123");

    expect(resolveAssetBaseUrl()).toBe(
      "https://cdn.example.com/app/embedding-sdk/",
    );
  });

  it("returns undefined when there is no current script and no window value", () => {
    setCurrentScriptSrc(undefined);

    expect(resolveAssetBaseUrl()).toBeUndefined();
  });

  it("returns undefined when the current script is a Storybook bundle, not the SDK entry", () => {
    // In Storybook `document.currentScript` points at a per-story bundle rather
    // than `embedding-sdk.js`; deriving a base from it would break chunk loading.
    setCurrentScriptSrc(
      "http://localhost:6006/embedding-sdk/embedding-sdk-bundle-components-public-InteractiveQuestion-InteractiveQuestion-stories.iframe.bundle.js",
    );

    expect(resolveAssetBaseUrl()).toBeUndefined();
  });
});
