import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  mockScrollBy,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type {
  CollectionId,
  CollectionItem,
  DashboardId,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
} from "metabase-types/api/mocks";

import type { DashboardPickerItem, DashboardPickerValueModel } from "../types";

import { DashboardPicker, defaultOptions } from "./DashboardPicker";
import { DashboardPickerModal } from "./DashboardPickerModal";

type NestedCollectionItem = Partial<Omit<CollectionItem, "id">> & {
  id: any;
  is_personal?: boolean;
  descendants: NestedCollectionItem[];
};

const myDashboard = createMockDashboard({
  id: 100,
  name: "My Dashboard 1",
  collection_id: 3,
});

const myDashboard2 = createMockDashboard({
  id: 101,
  name: "My Dashboard 2",
  collection_id: 3,
});

const collectionTree: NestedCollectionItem[] = [
  {
    id: "root",
    model: "collection",
    name: "Our Analytics",
    location: "",
    can_write: true,
    descendants: [
      {
        id: 4,
        name: "Collection 4",
        model: "collection",
        location: "/",
        effective_location: "/",
        can_write: true,
        descendants: [
          {
            id: 3,
            name: "Collection 3",
            model: "collection",
            descendants: [
              {
                ...myDashboard,
                model: "dashboard",
                descendants: [],
              },
              {
                ...myDashboard2,
                model: "dashboard",
                descendants: [],
              },
            ],
            location: "/4/",
            effective_location: "/4/",
            can_write: true,
            is_personal: false,
          },
        ],
      },
      {
        id: 2,
        model: "collection",
        is_personal: false,
        name: "Collection 2",
        location: "/",
        effective_location: "/",
        can_write: true,
        descendants: [],
      },
    ],
  },
  {
    name: "My personal collection",
    id: 1,
    model: "collection",
    location: "/",
    effective_location: "/",
    is_personal: true,
    can_write: true,
    descendants: [
      {
        id: 5,
        model: "collection",
        location: "/1/",
        effective_location: "/1/",
        name: "personal sub_collection",
        is_personal: true,
        can_write: true,
        descendants: [],
      },
    ],
  },
];

const flattenCollectionTree = (
  nodes: NestedCollectionItem[],
): Omit<NestedCollectionItem, "descendants">[] => {
  if (!nodes) {
    return [];
  }
  return nodes.flatMap(({ descendants, ...node }) => [
    node,
    ...flattenCollectionTree(descendants),
  ]);
};

const setupCollectionTreeMocks = (node: NestedCollectionItem[]) => {
  node.forEach(node => {
    if (!node.descendants) {
      return;
    }
    const collectionItems = node.descendants.map((c: NestedCollectionItem) =>
      createMockCollectionItem(c),
    );

    setupCollectionItemsEndpoint({
      collection: createMockCollection({ id: node.id }),
      collectionItems,
      models: ["collection", "dashboard"],
    });

    if (collectionItems.length > 0) {
      setupCollectionTreeMocks(node.descendants);
    }
  });
};

interface SetupOpts {
  initialValue?: {
    id: CollectionId | DashboardId;
    model: "collection" | "dashboard";
  };
  onChange?: (item: DashboardPickerItem) => void;
  models?: [DashboardPickerValueModel, ...DashboardPickerValueModel[]];
  options?: typeof defaultOptions;
}

const commonSetup = () => {
  setupRecentViewsAndSelectionsEndpoints([]);
  mockGetBoundingClientRect();
  mockScrollBy();
  setupSearchEndpoints([]);

  const allItems = flattenCollectionTree(collectionTree).map(
    createMockCollectionItem,
  );

  allItems.forEach(item => {
    if (item.model !== "collection") {
      fetchMock.get(`path:/api/dashboard/${item.id}`, item);
    } else {
      fetchMock.get(`path:/api/collection/${item.id}`, item);
    }
  });

  setupCollectionTreeMocks(collectionTree);
};

const setupPicker = async ({
  initialValue = { id: "root", model: "collection" },
  onChange = jest.fn<void, [DashboardPickerItem]>(),
}: SetupOpts = {}) => {
  commonSetup();

  renderWithProviders(
    <DashboardPicker
      onItemSelect={onChange}
      initialValue={initialValue}
      options={defaultOptions}
    />,
  );

  await waitForLoaderToBeRemoved();
};

const setupModal = async ({
  initialValue,
  onChange = jest.fn<void, [DashboardPickerItem]>(),
  options = defaultOptions,
}: SetupOpts = {}) => {
  commonSetup();

  renderWithProviders(
    <DashboardPickerModal
      onChange={onChange}
      value={initialValue}
      onClose={jest.fn()}
      options={options}
    />,
  );

  await waitForLoaderToBeRemoved();
};

describe("DashboardPicker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should select the root collection by default", async () => {
    await setupPicker();

    expect(
      await screen.findByRole("button", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /Collection 4/ }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: /Collection 2/ }),
    ).toBeInTheDocument();
  });

  it("should render the path to the collection provided", async () => {
    await setupPicker({ initialValue: { id: 3, model: "collection" } });
    expect(
      await screen.findByRole("button", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /Collection 4/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /Collection 3/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should render the path to the dashboard provided", async () => {
    await setupPicker({ initialValue: { id: 100, model: "dashboard" } });

    expect(
      await screen.findByRole("button", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /Collection 4/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /Collection 3/ }),
    ).toHaveAttribute("data-active", "true");

    // dashboard itself should start selected
    expect(
      await screen.findByRole("button", { name: /My Dashboard 1/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /My Dashboard 2/ }),
    ).not.toHaveAttribute("data-active", "true");
  });
});

describe("DashboardPickerModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render the modal", async () => {
    await setupModal();

    expect(await screen.findByText(/choose a dashboard/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Our Analytics/ }),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Select/ })).toBeInTheDocument();
  });

  it("should render the modal with no select button", async () => {
    await setupModal({
      options: { ...defaultOptions, hasConfirmButtons: false },
    });

    expect(await screen.findByText(/choose a dashboard/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Our Analytics/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Select/ }),
    ).not.toBeInTheDocument();
  });

  it("should render no tabs by default", async () => {
    await setupModal();

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("should automatically switch to the search tab when a search query is provided", async () => {
    await setupModal();

    const searchInput = await screen.findByPlaceholderText(/search/i);

    await userEvent.type(searchInput, "sizzlipede");

    expect(
      await screen.findByRole("tab", { name: /Dashboards/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Search/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("should switch back to not having tabs when the search query is cleared", async () => {
    await setupModal();

    const searchInput = await screen.findByPlaceholderText(/search/i);

    await userEvent.type(searchInput, "sizzlipede");

    expect(
      await screen.findByRole("tab", { name: /Dashboards/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Search/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.clear(searchInput);

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
