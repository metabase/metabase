import { act, renderHook, waitFor } from "@testing-library/react";

import { fetchDataAppBundleCode, instantiateDataAppBundle } from "../loader";

import { prepareEmbeddedDataApp } from "./prepare-embedded-data-app";
import { useDataAppBundle } from "./use-data-app-bundle";

jest.mock("../loader", () => ({
  ...jest.requireActual("../loader"),
  fetchDataAppBundleCode: jest.fn(),
  instantiateDataAppBundle: jest.fn(),
}));
jest.mock("./prepare-embedded-data-app");

describe("embedded data app bundle loading", () => {
  const component = () => null;

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(fetchDataAppBundleCode)
      .mockResolvedValue({ code: "BUNDLE", allowedHosts: [] });
    jest
      .mocked(instantiateDataAppBundle)
      .mockResolvedValue({ component, providerProps: {} });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("waits for the authenticated policy before fetching or evaluating the bundle", async () => {
    let applyPolicy = () => {};
    jest.mocked(prepareEmbeddedDataApp).mockReturnValue(
      new Promise<void>((resolve) => {
        applyPolicy = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useDataAppBundle("sales", { embedded: true }),
    );

    expect(fetchDataAppBundleCode).not.toHaveBeenCalled();
    expect(instantiateDataAppBundle).not.toHaveBeenCalled();

    await act(async () => {
      applyPolicy();
    });

    await waitFor(() => expect(result.current.data?.component).toBe(component));
    expect(fetchDataAppBundleCode).toHaveBeenCalledWith("sales", {
      embedded: true,
    });
    expect(instantiateDataAppBundle).toHaveBeenCalledWith(
      "BUNDLE",
      "sales",
      window,
      [],
      { embedded: true },
    );
  });

  it("does not fetch or evaluate a bundle when the authenticated policy is unavailable", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    jest
      .mocked(prepareEmbeddedDataApp)
      .mockRejectedValue(new Error("Access denied"));

    const { result } = renderHook(() =>
      useDataAppBundle("sales", { embedded: true }),
    );

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.error).toBe("Access denied");
    expect(fetchDataAppBundleCode).not.toHaveBeenCalled();
    expect(instantiateDataAppBundle).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[data-app] embedded app initialization failed",
      "sales",
      expect.objectContaining({ message: "Access denied" }),
    );
  });

  it("does not load a bundle if the embedding runtime unmounts during authorization", async () => {
    let applyPolicy = () => {};
    jest.mocked(prepareEmbeddedDataApp).mockReturnValue(
      new Promise<void>((resolve) => {
        applyPolicy = resolve;
      }),
    );

    const { unmount } = renderHook(() =>
      useDataAppBundle("sales", { embedded: true }),
    );
    unmount();

    await act(async () => {
      applyPolicy();
    });

    expect(fetchDataAppBundleCode).not.toHaveBeenCalled();
    expect(instantiateDataAppBundle).not.toHaveBeenCalled();
  });
});
