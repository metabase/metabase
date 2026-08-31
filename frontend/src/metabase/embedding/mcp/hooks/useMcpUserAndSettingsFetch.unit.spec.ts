import { renderHook, waitFor } from "@testing-library/react";

import type { SdkStore } from "embedding-sdk-bundle/store/types";

import { useMcpUserAndSettingsFetch } from "./useMcpUserAndSettingsFetch";

jest.mock("metabase/services", () => ({
  UserApi: { current: jest.fn().mockResolvedValue({}) },
}));

jest.mock("metabase/redux/settings", () => ({
  refreshSiteSettings: jest.fn(() => ({ type: "refresh-site-settings" })),
}));

describe("useMcpUserAndSettingsFetch", () => {
  it("keeps settings ready state even when the ui credential changes", async () => {
    const dispatch = jest.fn();

    // The hook only uses dispatch
    const store = { dispatch } as unknown as SdkStore;

    const { result, rerender } = renderHook(
      ({ uiCredential }) =>
        useMcpUserAndSettingsFetch({
          instanceUrl: "http://localhost:3000",
          store,
          uiCredential,
        }),
      { initialProps: { uiCredential: "credential-1" } },
    );

    await waitFor(() => {
      expect(result.current.isSettingsReady).toBe(true);
    });

    expect(dispatch).toHaveBeenCalledTimes(2);

    rerender({ uiCredential: "credential-2" });
    expect(result.current.isSettingsReady).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
