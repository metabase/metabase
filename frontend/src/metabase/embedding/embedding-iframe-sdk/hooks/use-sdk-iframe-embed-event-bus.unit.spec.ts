import { act, renderHook } from "@testing-library/react";

import { listenForEajsMessages } from "../utils/post-message";

import {
  isMetabaseInstance,
  useSdkIframeEmbedEventBus,
} from "./use-sdk-iframe-embed-event-bus";

jest.mock("../utils/post-message");

describe("use-sdk-iframe-embed-event-bus", () => {
  it("captures the actual sender origin independently of localhost settings", () => {
    jest.mocked(listenForEajsMessages).mockReturnValue(jest.fn());
    const store = { dispatch: jest.fn() };
    const { result } = renderHook(() => useSdkIframeEmbedEventBus({ store }));
    const message = {
      type: "metabase.embed.setSettings" as const,
      data: {
        componentName: "metabase-data-app" as const,
        instanceUrl: "https://metabase.example.com",
        path: "sales",
        _isLocalhost: true,
      },
    };
    const event = new MessageEvent("message", {
      origin: "https://host.example.com",
      data: message,
    });

    const options = jest.mocked(listenForEajsMessages).mock.calls[0][0];
    if (options.messageSource !== "embed.js") {
      throw new Error("Expected a listener for host messages");
    }

    act(() => options.handler(message, event));

    expect(result.current.parentOrigin).toBe("https://host.example.com");
    expect(result.current.embedSettings).toEqual(message.data);
  });

  it("drops a data app navigation request when newer settings change the path", () => {
    jest.mocked(listenForEajsMessages).mockReturnValue(jest.fn());
    const store = { dispatch: jest.fn() };
    const { result } = renderHook(() => useSdkIframeEmbedEventBus({ store }));

    const options = jest.mocked(listenForEajsMessages).mock.calls.at(-1)?.[0];
    if (options?.messageSource !== "embed.js") {
      throw new Error("Expected a listener for host messages");
    }

    const settings = (path: string) => ({
      type: "metabase.embed.setSettings" as const,
      data: {
        componentName: "metabase-data-app" as const,
        instanceUrl: "https://metabase.example.com",
        path,
      },
    });

    const navigation = {
      type: "metabase.embed.navigateToDataAppPath" as const,
      data: { path: "sales/a" },
    };

    const send = (message: ReturnType<typeof settings> | typeof navigation) =>
      options.handler(
        message,
        new MessageEvent("message", { origin: "https://host.example.com" }),
      );

    act(() => {
      send(settings("sales/a"));
      send(navigation);
    });
    expect(result.current.dataAppPathNavigationRequest).toEqual({
      path: "sales/a",
    });

    // settings with the same path, such as a locale change, keep the request
    act(() => send(settings("sales/a")));
    expect(result.current.dataAppPathNavigationRequest).toEqual({
      path: "sales/a",
    });

    // the web component sets the same path again, then changes it
    act(() => {
      send(navigation);
      send(settings("sales/c"));
    });
    expect(result.current.dataAppPathNavigationRequest).toBeNull();
    expect(result.current.embedSettings).toMatchObject({ path: "sales/c" });
  });

  describe("isMetabaseInstance", () => {
    it("returns true for same host with different protocols", () => {
      expect(
        isMetabaseInstance(
          "https://example.com/metabase",
          "http://example.com/metabase/other-path",
        ),
      ).toBe(true);
    });

    it("returns false for different hosts", () => {
      expect(
        isMetabaseInstance(
          "https://example.com",
          "https://another-example.com/path",
        ),
      ).toBe(false);
    });

    it("returns false for subdomains", () => {
      expect(
        isMetabaseInstance(
          "https://sub.example.com/path",
          "https://example.com/path",
        ),
      ).toBe(false);
    });

    describe("Metabase at subpath", () => {
      it("returns true for same host with same subpaths", () => {
        expect(
          isMetabaseInstance(
            "https://example.com/metabase",
            "https://example.com/metabase/other-path",
          ),
        ).toBe(true);
      });

      it("returns false for same host with different subpaths", () => {
        expect(
          isMetabaseInstance(
            "https://example.com/metabase",
            "https://example.com/other-path",
          ),
        ).toBe(false);
      });
    });
  });
});
