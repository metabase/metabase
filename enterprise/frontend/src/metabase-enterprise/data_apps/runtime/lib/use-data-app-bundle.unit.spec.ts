import { renderHook, waitFor } from "@testing-library/react";

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

type SetupOpts = {
  code?: string;
  allowedHosts?: string[];
  error?: Error;
  app?: LoadedApp;
};

function setup({
  code = "CODE",
  allowedHosts = [],
  error,
  app,
}: SetupOpts = {}) {
  if (error) {
    mockedFetch.mockRejectedValue(error);
  } else {
    mockedFetch.mockResolvedValue({ code, allowedHosts });
  }
  if (app) {
    mockedInstantiate.mockReturnValue(app);
  }
  return renderHook(() => useDataAppBundle("sales"));
}

describe("useDataAppBundle", () => {
  afterEach(() => jest.clearAllMocks());

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
});
