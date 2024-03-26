import fetchMock from "fetch-mock";

import { setupCollectionItemsEndpoint } from "__support__/server-mocks";
import {
  act,
  mockGetBoundingClientRect,
  mockScrollBy,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { CollectionId } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import type { QuestionPickerItem } from "../types";

import { QuestionPicker } from "./QuestionPicker";

type MockCollection = {
  id: CollectionId;
  name: string;
  location: string | null;
  is_personal: boolean;
  collections: MockCollection[];
};

const collectionTree: MockCollection[] = [
  {
    id: "root",
    name: "Our Analytics",
    location: null,
    is_personal: false,
    collections: [
      {
        id: 4,
        name: "Collection 4",
        location: "/",
        is_personal: false,
        collections: [
          {
            id: 3,
            name: "Collection 3",
            collections: [],
            location: "/4/",
            is_personal: false,
          },
        ],
      },
      {
        id: 2,
        is_personal: false,
        name: "Collection 2",
        location: "/",
        collections: [],
      },
    ],
  },
  {
    name: "My personal collection",
    id: 1,
    location: "/",
    is_personal: true,
    collections: [
      {
        id: 5,
        location: "/1/",
        name: "personal sub_collection",
        is_personal: true,
        collections: [],
      },
    ],
  },
];

const flattenCollectionTree = (
  node: MockCollection[],
): Omit<MockCollection, "collections">[] => {
  return [
    ...node.map(n => ({
      name: n.name,
      id: n.id,
      is_personal: !!n.is_personal,
      location: n.location,
    })),
  ].concat(...node.map(n => flattenCollectionTree(n.collections)));
};

const walkForCollectionItems = (node: MockCollection[]) => {
  node.forEach(n => {
    const collectionItems = n.collections.map((c: MockCollection) =>
      createMockCollectionItem({
        id: c.id as number,
        name: c.name,
        model: "collection",
        location: c.location || "/",
      }),
    );

    setupCollectionItemsEndpoint({
      collection: createMockCollection({ id: n.id }),
      collectionItems,
      models: ["collection"],
    });

    if (collectionItems.length > 0) {
      walkForCollectionItems(n.collections);
    }
  });
};

interface SetupOpts {
  initialValue?: {
    id: CollectionId;
    model: "collection";
  };
  onItemSelect?: (item: QuestionPickerItem) => void;
}

const setup = ({
  initialValue = { id: "root", model: "collection" },
  onItemSelect = jest.fn<void, [QuestionPickerItem]>(),
}: SetupOpts = {}) => {
  mockGetBoundingClientRect();
  mockScrollBy();

  const allCollections =
    flattenCollectionTree(collectionTree).map(createMockCollection);

  //Setup individual collection mocks
  allCollections.forEach(collection => {
    fetchMock.get(`path:/api/collection/${collection.id}`, collection);
  });

  //Setup collection items mocks

  walkForCollectionItems(collectionTree);

  return renderWithProviders(
    <QuestionPicker
      onItemSelect={onItemSelect}
      initialValue={initialValue}
      options={{}}
    />,
  );
};

describe("CollectionPicker", () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should select the root collection by default", async () => {
    act(() => {
      setup();
    });
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

  it("should render the path to the value provided", async () => {
    act(() => {
      setup({ initialValue: { id: 3, model: "collection" } });
    });
    expect(
      await screen.findByRole("button", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /Collection 4/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /Collection 3/ }),
    ).toHaveAttribute("data-active", "true");

    expect(await screen.findByLabelText("empty")).toBeInTheDocument();
  });

  it("should render the path back to personal collection", async () => {
    act(() => {
      setup({ initialValue: { id: 5, model: "collection" } });
    });
    expect(
      await screen.findByRole("button", { name: /My personal collection/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("button", { name: /personal sub_collection/ }),
    ).toHaveAttribute("data-active", "true");
  });
});
