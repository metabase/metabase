import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import {
  getSelectionPosition,
  getUrlTarget,
  open,
  parseDataUri,
  setSelectionPosition,
  shouldOpenInBlankWindow,
} from "metabase/lib/dom";

describe("getSelectionPosition/setSelectionPosition", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("should get/set selection on input correctly", () => {
    const input = document.createElement("input");
    container.appendChild(input);
    input.value = "hello world";
    setSelectionPosition(input, [3, 6]);
    const position = getSelectionPosition(input);
    expect(position).toEqual([3, 6]);
  });
});

describe("parseDataUri", () => {
  it("parses a valid text data URI", () => {
    const dataUri = "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==";
    const result = parseDataUri(dataUri);
    expect(result).toEqual({
      mimeType: "text/plain",
      charset: undefined,
      data: "Hello, World!",
      base64: "SGVsbG8sIFdvcmxkIQ==",
    });
  });

  it("returns null for an invalid data URI", () => {
    const invalidDataUri = "d4ta:text/plain;base64,SGVsbG8sIFdvcmxkIQ==";
    const result = parseDataUri(invalidDataUri);
    expect(result).toBeNull();
  });

  it("does not hang or crash on malicious DOS input", () => {
    // Regex DOS vulnerability test vector
    const malicious = "data:\u0000" + "\u0000,".repeat(100000) + "\n1\n";
    const start = Date.now();
    const result = parseDataUri(malicious);
    const duration = Date.now() - start;
    expect(result).toBeNull();
    expect(duration).toBeLessThan(1000);
  });
});

describe("shouldOpenInBlankWindow", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return false for same origin links by default", () => {
    const url = `${window.location.origin}/dashboard/1`;
    const result = shouldOpenInBlankWindow(url);
    expect(result).toBe(false);
  });

  it("should always return true when in embedding SDK", async () => {
    await mockIsEmbeddingSdk();
    const url = `${window.location.origin}/dashboard/1`;
    const result = shouldOpenInBlankWindow(url);
    expect(result).toBe(true);
  });
});

describe("getUrlTarget", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return _self for same origin links by default", () => {
    const url = `${window.location.origin}/dashboard/1`;
    const result = getUrlTarget(url);
    expect(result).toBe("_self");
  });

  it("should always return _blank when in the embedding SDK", async () => {
    await mockIsEmbeddingSdk();
    const url = `${window.location.origin}/dashboard/1`;
    const result = getUrlTarget(url);
    expect(result).toBe("_blank");
  });
});

describe("open()", () => {
  beforeEach(async () => {
    await mockIsEmbeddingSdk();
    // Ensure a clean store before each test
    ensureMetabaseProviderPropsStore().cleanup();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    ensureMetabaseProviderPropsStore().cleanup();
  });

  it("should prevent default behavior when handleLink returns { handled: true }", async () => {
    const handleLink = jest.fn().mockReturnValue({ handled: true });
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();
    const url = "https://example.com/dashboard/1";

    await open(url, {
      openInSameWindow,
      openInBlankWindow,
    });

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(openInSameWindow).not.toHaveBeenCalled();
    expect(openInBlankWindow).not.toHaveBeenCalled();
  });

  it("should allow default behavior when handleLink returns { handled: false }", async () => {
    const handleLink = jest.fn().mockReturnValue({ handled: false });
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();
    const url = "https://example.com/dashboard/1";

    await open(url, {
      openInSameWindow,
      openInBlankWindow,
    });

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(openInBlankWindow).toHaveBeenCalledWith(url);
  });

  it("should throw error when handleLink returns invalid value", async () => {
    const handleLink = jest.fn().mockReturnValue(true);
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();
    const url = "https://example.com/dashboard/1";

    await expect(
      open(url, {
        openInSameWindow,
        openInBlankWindow,
      }),
    ).rejects.toThrow(
      "handleLink plugin must return an object with a 'handled' property",
    );

    expect(handleLink).toHaveBeenCalledWith(url);
  });

  it("should not call handleLink when not in embedding SDK", async () => {
    await mockIsEmbeddingSdk(false);
    const handleLink = jest.fn();
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();
    const url = "https://example.com/dashboard/1";

    await open(url, {
      openInSameWindow,
      openInBlankWindow,
    });

    expect(handleLink).not.toHaveBeenCalled();
  });
});
