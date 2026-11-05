import { renderHook, waitFor } from "@testing-library/react";

import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { currentUserApi } from "metabase/current-user";
import { settingsApi } from "metabase/settings";
import MetabaseSettings from "metabase/utils/settings";
import { createMockMcpAppsBootstrapResponse } from "metabase-types/api/mocks";

import { fetchMcpBootstrap } from "../api";

import { useMcpUserAndSettingsFetch } from "./useMcpUserAndSettingsFetch";

jest.mock("../api", () => ({
  fetchMcpBootstrap: jest.fn(),
}));

jest.mock("metabase/current-user", () => ({
  currentUserApi: {
    util: {
      upsertQueryData: jest.fn(() => ({ type: "upsert-current-user" })),
    },
  },
  loadCurrentUser: jest.fn(() => ({ type: "load-current-user" })),
}));

jest.mock("metabase/settings", () => ({
  settingsApi: {
    util: {
      upsertQueryData: jest.fn(() => ({ type: "upsert-session-properties" })),
    },
    endpoints: {
      getSessionProperties: {
        initiate: jest.fn(() => ({ type: "initiate-session-properties" })),
      },
    },
  },
}));

jest.mock("metabase/utils/settings", () => ({
  __esModule: true,
  default: { setAll: jest.fn() },
}));

// The real payload rather than a stand-in, so the assertions pin the seeded cache to the
// endpoint's actual projection.
const BOOTSTRAP = createMockMcpAppsBootstrapResponse();

const OPTIONS = {
  instanceUrl: "http://localhost:3000",
  uiCredential: "credential-1",
  mcpSessionId: "session-1",
};

const setup = () => {
  const dispatch = jest.fn();
  // The hook only uses dispatch
  const store = { dispatch } as unknown as SdkStore;

  const { result, rerender } = renderHook(
    (props: { uiCredential: string }) =>
      useMcpUserAndSettingsFetch({ ...OPTIONS, ...props, store }),
    { initialProps: { uiCredential: OPTIONS.uiCredential } },
  );

  return { dispatch, result, rerender };
};

describe("useMcpUserAndSettingsFetch", () => {
  beforeEach(() => {
    jest.mocked(fetchMcpBootstrap).mockResolvedValue(BOOTSTRAP);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("seeds the user and settings caches from the MCP bootstrap endpoint", async () => {
    const { dispatch, result } = setup();

    await waitFor(() => {
      expect(result.current.isSettingsReady).toBe(true);
    });

    expect(fetchMcpBootstrap).toHaveBeenCalledWith(OPTIONS);
    expect(dispatch.mock.calls.flat()).toEqual([
      { type: "upsert-current-user" },
      { type: "upsert-session-properties" },
      { type: "load-current-user" },
      { type: "initiate-session-properties" },
    ]);
  });

  it("seeds the caches with the bootstrap payload verbatim, narrow user projection included", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(result.current.isSettingsReady).toBe(true);
    });

    expect(currentUserApi.util.upsertQueryData).toHaveBeenCalledWith(
      "getCurrentUser",
      undefined,
      BOOTSTRAP.user,
    );
    expect(settingsApi.util.upsertQueryData).toHaveBeenCalledWith(
      "getSessionProperties",
      undefined,
      BOOTSTRAP.settings,
    );
  });

  it("publishes the settings to consumers that live outside the store", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(result.current.isSettingsReady).toBe(true);
    });

    expect(MetabaseSettings.setAll).toHaveBeenCalledWith(BOOTSTRAP.settings);
  });

  it("keeps settings ready state even when the ui credential changes", async () => {
    const { dispatch, result, rerender } = setup();

    await waitFor(() => {
      expect(result.current.isSettingsReady).toBe(true);
    });

    rerender({ uiCredential: "credential-2" });

    expect(result.current.isSettingsReady).toBe(true);
    expect(fetchMcpBootstrap).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(4);
  });

  it("reports a rejected credential as an auth failure", async () => {
    jest
      .mocked(fetchMcpBootstrap)
      .mockRejectedValue(Object.assign(new Error("nope"), { status: 401 }));
    jest.spyOn(console, "error").mockImplementation(() => {});

    const { result } = setup();

    await waitFor(() => {
      expect(result.current.userAndSettingsFetchError).toMatch(
        /Authentication failed/,
      );
    });
    expect(result.current.isSettingsReady).toBe(false);
  });
});
