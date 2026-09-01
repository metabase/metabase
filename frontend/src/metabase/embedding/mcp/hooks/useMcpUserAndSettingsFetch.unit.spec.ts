import { renderHook, waitFor } from "@testing-library/react";

import type { SdkStore } from "embedding-sdk-bundle/store/types";

import { useMcpUserAndSettingsFetch } from "./useMcpUserAndSettingsFetch";

jest.mock("metabase/current-user", () => ({
  refetchCurrentUser: jest.fn(() => ({ type: "refetch-current-user" })),
}));

jest.mock("metabase/settings", () => ({
  refetchSiteSettings: jest.fn(() => ({ type: "refetch-site-settings" })),
}));

describe("useMcpUserAndSettingsFetch", () => {
  it("keeps settings ready state even when the ui credential changes", async () => {
    const unwrap = jest.fn().mockResolvedValue(undefined);
    const dispatch = jest.fn(() => ({ unwrap }));

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
