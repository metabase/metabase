import { renderHook, waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { setupCurrentUserEndpoint } from "__support__/server-mocks";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getUser } from "metabase/current-user";
import { createMockUser } from "metabase-types/api/mocks";

import { useHostSdkStore } from "./use-host-sdk-store";

describe("useHostSdkStore auth", () => {
  afterEach(() => {
    fetchMock.removeRoutes().clearHistory();

    ensureMetabaseProviderPropsStore().cleanup();
  });

  it("loads the authenticated user into the SDK store", async () => {
    const currentUser = createMockUser();
    setupCurrentUserEndpoint(currentUser);

    const { result } = renderHook(() => useHostSdkStore());

    await waitFor(() =>
      expect(getUser(result.current.getState())).toEqual(currentUser),
    );

    expect(fetchMock.callHistory.calls("path:/api/user/current")).toHaveLength(
      1,
    );
  });
});
