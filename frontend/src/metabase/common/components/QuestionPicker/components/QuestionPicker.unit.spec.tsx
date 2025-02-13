import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupDashboardItemsEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  mockScrollBy,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { CollectionId, CollectionItem } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type {
  QuestionPickerItem,
  QuestionPickerStatePath,
  QuestionPickerValueModel,
} from "../types";

import { QuestionPicker, defaultOptions } from "./QuestionPicker";
import { QuestionPickerModal } from "./QuestionPickerModal";

type NestedCollectionItem = Partial<CollectionItem> & {
  id: any;
  is_personal?: boolean;
  descendants?: NestedCollectionItem[];
};

const rootQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 104,
    name: "Question in Root",
    collection_id: null,
  }),
  model: "card",
});

const rootDashboard = createMockCollectionItem({
  ...createMockDashboard({
    name: "Root Dashboard",
    collection_id: null,
  }),
  id: 105,
  location: "/",
  model: "dashboard",
});

const rootDashboardQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 107,
    name: "DQ in Root",
    collection_id: null,
    dashboard_id: rootDashboard.id,
  }),
  model: "card",
});

const nestedQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 100,
    name: "Nested Question",
    collection_id: 3,
  }),
  model: "card",
});

const nestedDashboard = createMockCollectionItem({
  ...createMockDashboard({
    name: "Nested Dashboard",
    collection_id: 3,
    collection: createMockCollection({
      id: 3,
      location: "/4/",
    }),
  }),
  location: "/4/",
  id: 106,
  model: "dashboard",
});

const nestedDashboardQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 108,
    name: "Nested DQ",
    collection_id: 3,
    dashboard_id: nestedDashboard.id,
    dashboard: nestedDashboard,
  }),
  model: "card",
});

const myVerifiedQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 103,
    name: "My Verified Question",
    collection_id: 3,
  }),
  moderated_status: "verified",
});

const myModel = createMockCollectionItem({
  ...createMockCard({
    id: 101,
    name: "My Model",
    collection_id: 3,
    type: "model",
  }),
  model: "dataset",
});

const myMetric = createMockCollectionItem({
  ...createMockCard({
    id: 102,
    name: "My Metric",
    collection_id: 3,
    type: "metric",
  }),
  model: "metric",
});

const collectionTree: NestedCollectionItem[] = [
  {
    id: "root" as any,
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
        can_write: true,
        descendants: [
          {
            id: 3,
            name: "Collection 3",
            model: "collection",
            descendants: [
              nestedQuestion,
              nestedDashboard,
              nestedDashboardQuestion,
              myModel,
              myMetric,
              myVerifiedQuestion,
            ],
            location: "/4/",
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
        can_write: true,
        descendants: [],
      },
      rootQuestion,
      rootDashboard,
      rootDashboardQuestion,
    ],
  },
  {
    name: "My personal collection",
    id: 1,
    model: "collection",
    location: "/",
    is_personal: true,
    can_write: true,
    descendants: [
      {
        id: 5,
        model: "collection",
        location: "/1/",
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
  return nodes.flatMap(({ descendants = [], ...node }) => [
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
    });

    if (collectionItems.length > 0) {
      setupCollectionTreeMocks(node.descendants);
    }
  });
};

interface SetupOpts {
  initialValue?: {
    id: CollectionId;
    model: "collection" | "card" | "dataset" | "metric";
  };
  onChange?: (item: QuestionPickerItem) => void;
  models?: [QuestionPickerValueModel, ...QuestionPickerValueModel[]];
  options?: typeof defaultOptions;
}

const commonSetup = () => {
  mockGetBoundingClientRect();
  mockScrollBy();
  setupRecentViewsAndSelectionsEndpoints([]);

  const allItems = flattenCollectionTree(collectionTree).map(
    createMockCollectionItem,
  );

  allItems.forEach(item => {
    if (item.model === "collection") {
      fetchMock.get(`path:/api/collection/${item.id}`, item);
    } else if (item.model === "dashboard") {
      fetchMock.get(`path:/api/dashboard/${item.id}`, item);

      const dashboardId = item.id;
      const dashboardItems = allItems.filter(
        (item: any) => item.dashboard_id === dashboardId,
      );
      setupDashboardItemsEndpoint({
        dashboard: item as any,
        dashboardItems,
      });
    } else {
      fetchMock.get(`path:/api/card/${item.id}`, item);
    }
  });

  setupCollectionTreeMocks(collectionTree);
};

const setupPicker = async ({
  initialValue = { id: "root", model: "collection" },
  onChange = jest.fn<void, [QuestionPickerItem]>(),
}: SetupOpts = {}) => {
  commonSetup();

  const tokenFeatures = createMockTokenFeatures({
    content_verification: true,
    official_collections: true,
  });
  const settings = createMockSettings();

  const settingValuesWithToken = {
    ...settings,
    "token-features": tokenFeatures,
  };

  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
  });

  setupEnterprisePlugins();

  function TestComponent() {
    const [path, setPath] = useState<QuestionPickerStatePath>();

    return (
      <QuestionPicker
        initialValue={initialValue}
        models={["card", "dashboard"]}
        options={defaultOptions}
        path={path}
        onInit={jest.fn()}
        onItemSelect={onChange}
        onPathChange={setPath}
      />
    );
  }

  renderWithProviders(<TestComponent />, { storeInitialState: state });

  await waitForLoaderToBeRemoved();
};

// zero indexed
const level = async (index: number) => {
  return within(await screen.findByTestId(`item-picker-level-${index}`));
};

const setupModal = async ({
  initialValue,
  models = ["card", "dataset"],
  onChange = jest.fn<void, [QuestionPickerItem]>(),
  options = defaultOptions,
}: SetupOpts = {}) => {
  commonSetup();

  renderWithProviders(
    <QuestionPickerModal
      onChange={onChange}
      value={initialValue}
      onClose={jest.fn()}
      models={models}
      options={options}
    />,
  );

  await waitForLoaderToBeRemoved();
};

describe("QuestionPicker", () => {
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

  describe("initial value", () => {
    it("should render the path to a question in the root collection", async () => {
      await setupPicker({ initialValue: { id: 104, model: "card" } });

      expect(
        await (await level(0)).findByRole("button", { name: /Our Analytics/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (
          await level(1)
        ).findByRole("button", { name: /Question in Root/ }),
      ).toHaveAttribute("data-active", "true");
    });

    it("should render the path to a question nested in multiple collections", async () => {
      await setupPicker({ initialValue: { id: 100, model: "card" } });

      expect(
        await (await level(0)).findByRole("button", { name: /Our Analytics/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(1)).findByRole("button", { name: /Collection 4/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(2)).findByRole("button", { name: /Collection 3/ }),
      ).toHaveAttribute("data-active", "true");

      // question itself should start selected
      expect(
        await (
          await level(3)
        ).findByRole("button", { name: /Nested Question/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await within(
          await screen.findByRole("button", { name: /My Verified Question/ }),
        ).findByRole("img", { name: /verified_filled/ }),
      ).toBeInTheDocument();
    });

    it("should render the path to a dashboard question where dashboard is in the root collection", async () => {
      await setupPicker({
        initialValue: { id: rootDashboardQuestion.id, model: "card" },
      });

      expect(
        await (await level(0)).findByRole("button", { name: /Our Analytics/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(1)).findByRole("button", { name: /Root Dashboard/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(2)).findByRole("button", { name: /DQ in Root/ }),
      ).toHaveAttribute("data-active", "true");
    });

    it("should render the path to a dashboard question in a nested collection", async () => {
      await setupPicker({
        initialValue: { id: nestedDashboardQuestion.id, model: "card" },
      });

      expect(
        await (await level(0)).findByRole("button", { name: /Our Analytics/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(1)).findByRole("button", { name: /Collection 4/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(2)).findByRole("button", { name: /Collection 3/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (
          await level(3)
        ).findByRole("button", { name: /Nested Dashboard/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(4)).findByRole("button", { name: /Nested DQ/ }),
      ).toHaveAttribute("data-active", "true");
    });
  });
});

describe("QuestionPickerModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render the modal", async () => {
    await setupModal();

    expect(
      await screen.findByText(/choose a question or model/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Our Analytics/ }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /Select/ }),
    ).not.toBeInTheDocument();
  });

  it("should render the modal with a select button", async () => {
    await setupModal({
      options: { ...defaultOptions, hasConfirmButtons: true },
    });

    expect(
      await screen.findByText(/choose a question or model/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Our Analytics/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Select/ }),
    ).toBeInTheDocument();
  });

  it("should render model and question tabs by default", async () => {
    await setupModal();

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /Models/ }),
    ).toBeInTheDocument();
  });

  it("should render the metric tab if explicitly enabled", async () => {
    await setupModal({ models: ["card", "dataset", "metric"] });

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /Models/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /Metrics/ }),
    ).toBeInTheDocument();
  });

  it("can render a single tab (which hides the tab bar)", async () => {
    await setupModal({ models: ["dataset"] });

    expect(
      await screen.findByText(/choose a question or model/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("should auto-select the question tab when a question is selected", async () => {
    await setupModal({
      initialValue: { id: 100, model: "card" },
    });

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("tab", { name: /Models/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    expect(
      await screen.findByRole("button", { name: /Nested Question/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should auto-select the model tab when a model is selected", async () => {
    await setupModal({
      initialValue: { id: 101, model: "dataset" },
    });

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Models/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    expect(
      await screen.findByRole("button", { name: /My Model/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should auto-select the metric tab when a metric is selected", async () => {
    await setupModal({
      initialValue: { id: 102, model: "metric" },
      models: ["card", "dataset", "metric"],
    });

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Metrics/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    expect(
      await screen.findByRole("button", { name: /My Metric/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should automatically switch to the search tab when a search query is provided", async () => {
    await setupSearchEndpoints([]);
    await setupModal();

    const searchInput = await screen.findByPlaceholderText(/search/i);

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "true");

    await userEvent.type(searchInput, "sizzlipede");

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Search/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await screen.findByText(/Didn't find anything/i);
  });

  it("should switch back to the default tab when the search query is cleared", async () => {
    await setupSearchEndpoints([]);
    await setupModal();

    const searchInput = await screen.findByPlaceholderText(/search/i);

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "true");

    await userEvent.type(searchInput, "sizzlipede");

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Search/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await screen.findByText(/Didn't find anything/i);

    await userEvent.clear(searchInput);

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByRole("tab", { name: /Search/ }),
    ).not.toBeInTheDocument();
  });

  it("should be able to search for metrics", async () => {
    await setupSearchEndpoints([nestedQuestion, myModel, myMetric]);
    await setupModal({ models: ["card", "dataset", "metric"] });
    const searchInput = await screen.findByPlaceholderText(/search/i);
    await userEvent.type(searchInput, myMetric.name);
    await userEvent.click(screen.getByText("Everywhere"));
    expect(await screen.findByText(myMetric.name)).toBeInTheDocument();
    expect(screen.queryByText(nestedQuestion.name)).not.toBeInTheDocument();
  });
});
