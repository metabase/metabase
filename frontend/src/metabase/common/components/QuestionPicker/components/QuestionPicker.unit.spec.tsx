import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import _ from "underscore";

import {
  setupCollectionItemsEndpoint,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  mockScrollBy,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { CollectionId, CollectionItem } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import type { QuestionPickerItem, QuestionPickerValueModel } from "../types";

import { QuestionPicker, defaultOptions } from "./QuestionPicker";
import { QuestionPickerModal } from "./QuestionPickerModal";

type NestedCollectionItem = Partial<CollectionItem> & {
  id: any;
  is_personal?: boolean;
  descendants: NestedCollectionItem[];
};

const myQuestion = createMockCard({
  id: 100,
  name: "My Question",
  collection_id: 3,
});

const myModel = createMockCard({
  id: 101,
  name: "My Model",
  collection_id: 3,
  type: "model",
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
              {
                ...myQuestion,
                model: "card",
                descendants: [],
              },
              {
                ...myModel,
                model: "dataset",
                descendants: [],
              },
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
      models: ["collection", "dataset", "card"],
    });

    if (collectionItems.length > 0) {
      setupCollectionTreeMocks(node.descendants);
    }
  });
};

interface SetupOpts {
  initialValue?: {
    id: CollectionId;
    model: "collection" | "card" | "dataset";
  };
  onChange?: (item: QuestionPickerItem) => void;
  models?: [QuestionPickerValueModel, ...QuestionPickerValueModel[]];
  options?: typeof defaultOptions;
}

const commonSetup = () => {
  mockGetBoundingClientRect();
  mockScrollBy();
  setupRecentViewsEndpoints([]);

  const allItems = flattenCollectionTree(collectionTree).map(
    createMockCollectionItem,
  );

  allItems.forEach(item => {
    if (item.model !== "collection") {
      fetchMock.get(`path:/api/card/${item.id}`, item);
    } else {
      fetchMock.get(`path:/api/collection/${item.id}`, item);
    }
  });

  setupCollectionTreeMocks(collectionTree);
};

const setupPicker = async ({
  initialValue = { id: "root", model: "collection" },
  onChange = jest.fn<void, [QuestionPickerItem]>(),
}: SetupOpts = {}) => {
  commonSetup();

  renderWithProviders(
    <QuestionPicker
      onItemSelect={onChange}
      initialValue={initialValue}
      models={["card"]}
      options={defaultOptions}
    />,
  );

  await waitForLoaderToBeRemoved();
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
  afterAll(() => {
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

  it("should render the path to the question provided", async () => {
    await setupPicker({ initialValue: { id: 100, model: "card" } });

    expect(
      await screen.findByRole("button", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /Collection 4/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /Collection 3/ }),
    ).toHaveAttribute("data-active", "true");

    // question itself should start selected
    expect(
      await screen.findByRole("button", { name: /My Question/ }),
    ).toHaveAttribute("data-active", "true");
  });
});

describe("QuestionPickerModal", () => {
  afterAll(() => {
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
      await screen.findByRole("button", { name: /My Question/ }),
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
});
