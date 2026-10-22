import { act, renderHook, waitFor } from "@testing-library/react";

import {
  DataAppBundleError,
  fetchDataAppBundleCode,
  instantiateDataAppBundle,
} from "../loader";

import { reportErrorToParent } from "./report-error-to-parent";
import { type LoadedApp, useDataAppBundle } from "./use-data-app-bundle";

jest.mock("../loader", () => ({
  ...jest.requireActual("../loader"),
  fetchDataAppBundleCode: jest.fn(),
  instantiateDataAppBundle: jest.fn(),
}));
jest.mock("./report-error-to-parent", () => ({
  reportErrorToParent: jest.fn(),
}));

const mockedFetch = jest.mocked(fetchDataAppBundleCode);
const mockedInstantiate = jest.mocked(instantiateDataAppBundle);
const mockedReport = jest.mocked(reportErrorToParent);

const LOADED_APP: LoadedApp = { component: () => null, providerProps: {} };
const CSP_POLICY =
  "default-src 'none'; connect-src 'self' https://api.example.com; form-action 'none';";

const getCspMetaTags = () =>
  // eslint-disable-next-line testing-library/no-node-access -- meta tag isn't part of React tree
  document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');

const getCspMetaTag = () => getCspMetaTags()[0] ?? null;

type SetupOpts = {
  code?: string;
  allowedHosts?: string[];
  contentSecurityPolicy?: string | null;
  embedded?: boolean;
  error?: Error;
  app?: LoadedApp;
};

function setup({
  code = "CODE",
  allowedHosts = [],
  contentSecurityPolicy = null,
  embedded = false,
  error,
  app,
}: SetupOpts = {}) {
  if (error) {
    mockedFetch.mockRejectedValue(error);
  } else {
    mockedFetch.mockResolvedValue({
      code,
      allowedHosts,
      contentSecurityPolicy,
    });
  }
  if (app) {
    // Instantiating is async: Near-Membrane defers setup to the realm iframe's
    // `load` event once the sandbox is given a realm-host document.
    mockedInstantiate.mockResolvedValue(app);
  }
  return renderHook(() => useDataAppBundle("sales", { embedded }));
}

describe("useDataAppBundle", () => {
  beforeEach(() => jest.resetAllMocks());

  afterEach(() => {
    jest.restoreAllMocks();

    document
      // eslint-disable-next-line testing-library/no-node-access -- meta tag isn't part of React tree
      .querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
      .forEach((meta) => meta.remove());
  });

  it("fetches, instantiates, and exposes the loaded app", async () => {
    const { result } = setup({
      code: "CODE",
      allowedHosts: ["https://x"],
      app: LOADED_APP,
    });

    await waitFor(() => expect(result.current.data).toEqual(LOADED_APP));
    expect(result.current.failed).toBe(false);
    expect(mockedInstantiate).toHaveBeenCalledWith("CODE", "sales", window, [
      "https://x",
    ]);
    expect(mockedReport).not.toHaveBeenCalled();
  });

  it("does not install CSP meta tag when not embedded", async () => {
    const { result } = setup({
      contentSecurityPolicy: CSP_POLICY,
      app: LOADED_APP,
    });

    await waitFor(() => expect(result.current.data).toEqual(LOADED_APP));
    expect(getCspMetaTag()).toBeNull();
  });

  it("treats a 404 as the friendly not-ready state (no error detail)", async () => {
    const { result } = setup({ error: new DataAppBundleError("nope", 404) });

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.data).toBeNull();
    expect(mockedReport).toHaveBeenCalledWith(true, undefined);
  });

  it("reports the real error detail for any non-404 failure", async () => {
    const { result } = setup({ error: new Error("boom") });

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(mockedReport).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ message: "boom" }),
    );
  });

  it("catches an uncaught window error that escapes the render cycle", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { result } = setup({ app: LOADED_APP });
    await waitFor(() => expect(result.current.data).toEqual(LOADED_APP));

    window.dispatchEvent(
      new ErrorEvent("error", {
        error: new Error("kaboom"),
        message: "kaboom",
      }),
    );

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(mockedReport).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ message: "kaboom" }),
    );
    consoleError.mockRestore();
  });

  it("ignores window error events with no error object (resource loads)", async () => {
    const { result } = setup({ app: LOADED_APP });
    await waitFor(() => expect(result.current.data).toEqual(LOADED_APP));

    window.dispatchEvent(new ErrorEvent("error", { error: null }));

    expect(result.current.failed).toBe(false);
    expect(mockedReport).not.toHaveBeenCalled();
  });

  describe("embedded mode", () => {
    beforeEach(() => {
      jest.spyOn(console, "error").mockImplementation(() => {});
    });

    it("installs CSP policy before evaluating bundle", async () => {
      mockedInstantiate.mockImplementation(async () => {
        // The bundle could load resources disallowed by CSP during evaluation.
        expect(getCspMetaTag()?.getAttribute("content")).toBe(CSP_POLICY);

        return LOADED_APP;
      });

      const { result } = setup({
        code: "BUNDLE",
        contentSecurityPolicy: CSP_POLICY,
        embedded: true,
      });

      await waitFor(() =>
        expect(result.current.data?.component).toBe(LOADED_APP.component),
      );
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch).toHaveBeenCalledWith("sales", { embedded: true });

      expect(mockedInstantiate).toHaveBeenCalledWith(
        "BUNDLE",
        "sales",
        window,
        [],
      );
    });

    it("does not install the same CSP policy twice when the app name changes", async () => {
      mockedFetch.mockResolvedValue({
        code: "BUNDLE",
        allowedHosts: [],
        contentSecurityPolicy: CSP_POLICY,
      });

      mockedInstantiate.mockResolvedValue(LOADED_APP);

      const { rerender } = renderHook(
        ({ name }) => useDataAppBundle(name, { embedded: true }),
        { initialProps: { name: "sales" } },
      );

      await waitFor(() => expect(mockedInstantiate).toHaveBeenCalledTimes(1));

      rerender({ name: "inventory" });
      await waitFor(() => expect(mockedInstantiate).toHaveBeenCalledTimes(2));
      expect(mockedFetch).toHaveBeenNthCalledWith(2, "inventory", {
        embedded: true,
      });
      expect(getCspMetaTags()).toHaveLength(1);
    });

    it.each([null, "", " "])(
      "reports error when the CSP is missing: %p",
      async (contentSecurityPolicy) => {
        const { result } = setup({
          contentSecurityPolicy,
          embedded: true,
          app: LOADED_APP,
        });

        await waitFor(() => expect(result.current.failed).toBe(true));
        expect(mockedInstantiate).not.toHaveBeenCalled();
        expect(result.current.error).toBe(
          "Something went wrong while loading this app. Try refreshing the page.",
        );
        expect(mockedReport).not.toHaveBeenCalled();
      },
    );

    it.each([403, 404, 409])(
      "reports error for a missing bundle: %s",
      async (status) => {
        const { result } = setup({
          embedded: true,
          error: new DataAppBundleError("Bundle unavailable", status),
        });

        await waitFor(() => expect(result.current.failed).toBe(true));
        expect(mockedInstantiate).not.toHaveBeenCalled();
        expect(result.current.error).toBe("Bundle unavailable");
        expect(mockedReport).not.toHaveBeenCalled();
      },
    );

    it("discards the bundle and CSP policy if hook unmounts before bundle is fetched", async () => {
      let completeFetch = (
        _value: Awaited<ReturnType<typeof fetchDataAppBundleCode>>,
      ) => {};

      mockedFetch.mockReturnValue(
        new Promise((resolve) => {
          completeFetch = resolve;
        }),
      );

      const { unmount } = renderHook(() =>
        useDataAppBundle("sales", { embedded: true }),
      );

      unmount();

      await act(async () => {
        completeFetch({
          code: "BUNDLE",
          allowedHosts: [],
          contentSecurityPolicy: CSP_POLICY,
        });
      });

      expect(getCspMetaTag()).toBeNull();
      expect(mockedInstantiate).not.toHaveBeenCalled();
    });
  });
});
