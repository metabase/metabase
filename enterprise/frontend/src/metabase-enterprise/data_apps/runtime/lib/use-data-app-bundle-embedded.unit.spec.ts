import { act, renderHook, waitFor } from "@testing-library/react";

import {
  DataAppBundleError,
  fetchDataAppBundleCode,
  instantiateDataAppBundle,
} from "../loader";

import { useDataAppBundle } from "./use-data-app-bundle";

jest.mock("../loader", () => ({
  ...jest.requireActual("../loader"),
  fetchDataAppBundleCode: jest.fn(),
  instantiateDataAppBundle: jest.fn(),
}));

const CSP_POLICY =
  "default-src 'none'; connect-src 'self' https://api.example.com; form-action 'none';";

const BUNDLE_RESPONSE = {
  code: "BUNDLE",
  allowedHosts: [],
  contentSecurityPolicy: CSP_POLICY,
};

const getCspMetaTag = () =>
  // eslint-disable-next-line testing-library/no-node-access -- meta tag isn't part of React tree
  document.querySelector('meta[http-equiv="Content-Security-Policy"]');

describe("loading embedded data app bundle", () => {
  const component = () => null;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.mocked(fetchDataAppBundleCode).mockResolvedValue(BUNDLE_RESPONSE);

    jest
      .mocked(instantiateDataAppBundle)
      .mockResolvedValue({ component, providerProps: {} });
  });

  afterEach(() => {
    jest.restoreAllMocks();

    document
      // eslint-disable-next-line testing-library/no-node-access -- meta tag isn't part of React tree
      .querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
      .forEach((meta) => meta.remove());
  });

  it("installs CSP policy before evaluating bundle", async () => {
    jest.mocked(instantiateDataAppBundle).mockImplementation(async () => {
      // If the CSP policy is installed after bundle evaluates,
      // the bundle could load resources that are disallowed by CSP.
      // This assertion fails if the meta tag isn't present when the bundle evaluates.
      expect(getCspMetaTag()?.getAttribute("content")).toBe(CSP_POLICY);

      return { component, providerProps: {} };
    });

    const { result } = renderHook(() =>
      useDataAppBundle("sales", { embedded: true }),
    );

    await waitFor(() => expect(result.current.data?.component).toBe(component));
    expect(fetchDataAppBundleCode).toHaveBeenCalledTimes(1);
    expect(fetchDataAppBundleCode).toHaveBeenCalledWith("sales", {
      embedded: true,
    });

    expect(instantiateDataAppBundle).toHaveBeenCalledWith(
      "BUNDLE",
      "sales",
      window,
      [],
    );
  });

  it.each([null, undefined, "", " "])(
    "reports error when the CSP is missing: %p",
    async (contentSecurityPolicy) => {
      jest
        .mocked(fetchDataAppBundleCode)
        .mockResolvedValue({ ...BUNDLE_RESPONSE, contentSecurityPolicy });

      const { result } = renderHook(() =>
        useDataAppBundle("sales", { embedded: true }),
      );

      await waitFor(() => expect(result.current.failed).toBe(true));
      expect(instantiateDataAppBundle).not.toHaveBeenCalled();
      expect(result.current.error).toBe(
        "Something went wrong while loading this app. Try refreshing the page.",
      );
    },
  );

  it.each([403, 404, 409])(
    "reports error for a missing bundle: %s",
    async (status) => {
      jest
        .mocked(fetchDataAppBundleCode)
        .mockRejectedValue(
          new DataAppBundleError("Bundle unavailable", status),
        );

      const { result } = renderHook(() =>
        useDataAppBundle("sales", { embedded: true }),
      );

      await waitFor(() => expect(result.current.failed).toBe(true));
      expect(instantiateDataAppBundle).not.toHaveBeenCalled();
      expect(result.current.error).toBe("Bundle unavailable");
    },
  );

  it("discards the bundle and CSP policy if hook unmounts before bundle is fetched", async () => {
    let completeFetch = (_value: typeof BUNDLE_RESPONSE) => {};

    jest.mocked(fetchDataAppBundleCode).mockReturnValue(
      new Promise((resolve) => {
        completeFetch = resolve;
      }),
    );

    const { unmount } = renderHook(() =>
      useDataAppBundle("sales", { embedded: true }),
    );

    unmount();

    await act(async () => {
      completeFetch(BUNDLE_RESPONSE);
    });

    expect(getCspMetaTag()).toBeNull();
    expect(instantiateDataAppBundle).not.toHaveBeenCalled();
  });
});
