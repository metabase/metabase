import { act } from "@testing-library/react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupDashboardEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderHookWithProviders } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import {
  createMockCollection,
  createMockDashboard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { useSetCollection } from "./use-set-collection";

describe("useSetCollection", () => {
  afterEach(() => {
    reinitialize();
  });

  // a dashboard can't be moved back into the Library, so its undo would fail
  it.each([
    { collectionType: "library-dashboards", undoActionCount: 0 },
    { collectionType: null, undoActionCount: 1 },
  ] as const)(
    "offers $undoActionCount undo actions after moving a dashboard out of a $collectionType collection",
    async ({ collectionType, undoActionCount }) => {
      const dashboard = createMockDashboard({
        id: 1,
        collection_id: 51,
        collection: createMockCollection({ id: 51, type: collectionType }),
      });
      const settings = mockSettings({
        "token-features": createMockTokenFeatures({ library: true }),
      });
      setupEnterpriseOnlyPlugin("library");
      setupDashboardEndpoints(dashboard);
      const { result, store } = renderHookWithProviders(
        () => useSetCollection(),
        { storeInitialState: createMockState({ settings }) },
      );

      await act(() =>
        result.current({ model: "dashboard", id: dashboard.id }, { id: 60 }),
      );

      const undos = store.getState().undo;
      expect(undos).toHaveLength(1);
      expect(undos[0].actions).toHaveLength(undoActionCount);
    },
  );
});
