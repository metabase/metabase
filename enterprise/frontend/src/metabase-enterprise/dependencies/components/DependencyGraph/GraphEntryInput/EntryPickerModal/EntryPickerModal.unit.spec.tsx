import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupListDataAppsEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { defer } from "metabase/utils/promise";
import { EnterpriseApi } from "metabase-enterprise/api";
import { listTag } from "metabase-enterprise/api/tags";
import type {
  DataApp,
  DependencyEntry,
  DependencyNode,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDataApp,
  createMockDataAppDependencyNode,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { EntryPickerModal } from "./EntryPickerModal";

const OWLS = createMockDataApp({ id: 8, name: "owls", display_name: "Owls" });

// The current user's personal collection, which the picker fetches for its root list.
const PERSONAL_COLLECTION = createMockCollection({
  id: 1,
  name: "Bobby Tables's Personal Collection",
  personal_owner_id: 1,
});

type SetupOpts = {
  dataApps?: DataApp[];
  hasDataApps?: boolean;
  value?: DependencyNode | null;
};

function setup({
  dataApps = [OWLS],
  hasDataApps = true,
  value = null,
}: SetupOpts = {}) {
  mockGetBoundingClientRect();
  setupListDataAppsEndpoint(dataApps);
  setupDatabasesEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: createMockCollection({ id: "root", name: "Our analytics" }),
  });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  setupCollectionByIdEndpoint({ collections: [PERSONAL_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [],
  });

  const onChange = jest.fn<void, [DependencyEntry]>();
  const { store } = renderWithProviders(
    <EntryPickerModal value={value} onChange={onChange} onClose={jest.fn()} />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            "data-apps": hasDataApps,
          }),
        }),
      }),
    },
  );
  return { onChange, store };
}

describe("EntryPickerModal", () => {
  it("picks a data app from the Data apps folder as the entry", async () => {
    const { onChange } = setup();

    await userEvent.click(await screen.findByText("Data apps"));
    await userEvent.click(await screen.findByText("Owls"));

    expect(onChange).toHaveBeenCalledWith({ id: 8, type: "data-app" });
  });

  it("opens on the data app whose graph is shown, selected", async () => {
    const HERONS = createMockDataApp({
      id: 9,
      name: "herons",
      display_name: "Herons",
    });
    setup({
      dataApps: [OWLS, HERONS],
      value: createMockDataAppDependencyNode({ id: OWLS.id }),
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Owls/ })).toHaveAttribute(
        "data-active",
        "true",
      );
    });
    expect(screen.getByRole("link", { name: /Data apps/ })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("link", { name: /Herons/ })).not.toHaveAttribute(
      "data-active",
    );
  });

  it("shows no folder until the app list loads, then opens on the data app", async () => {
    const appsResponse = defer<DataApp[]>();
    fetchMock.get("path:/api/apps", () => appsResponse.promise);
    setup({ value: createMockDataAppDependencyNode({ id: OWLS.id }) });

    // The root collection is the last thing the root list asks for besides the app list.
    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/collection/root")).toBe(
        true,
      );
    });
    await expect(
      screen.findByRole("link", { name: /Our analytics/ }, { timeout: 500 }),
    ).rejects.toThrow();

    appsResponse.resolve([OWLS]);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Owls/ })).toHaveAttribute(
        "data-active",
        "true",
      );
    });
  });

  it("keeps the folder the user opened when the app list changes", async () => {
    let dataApps = [OWLS];
    fetchMock.get("path:/api/apps", () => dataApps);
    const { store } = setup({
      value: createMockDataAppDependencyNode({ id: OWLS.id }),
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Owls/ })).toHaveAttribute(
        "data-active",
        "true",
      );
    });
    await userEvent.click(screen.getByRole("link", { name: /Our analytics/ }));
    dataApps = [];
    act(() => {
      store.dispatch(EnterpriseApi.util.invalidateTags([listTag("data-app")]));
    });

    await waitFor(() => {
      expect(screen.queryByText("Data apps")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Our analytics/ })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("has no Data apps folder when the user has no data apps", async () => {
    setup({ dataApps: [] });

    await screen.findByText("Our analytics");
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/apps", { method: "GET" }),
      ).toBe(true);
    });
    expect(screen.queryByText("Data apps")).not.toBeInTheDocument();
  });

  it("has no Data apps folder without the data apps feature", async () => {
    setup({ hasDataApps: false });

    await screen.findByText("Our analytics");
    expect(screen.queryByText("Data apps")).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/apps", { method: "GET" }),
    ).toBe(false);
  });
});
