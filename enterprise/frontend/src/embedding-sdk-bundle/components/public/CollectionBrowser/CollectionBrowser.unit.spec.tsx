import fetchMock from "fetch-mock";
import type { ComponentProps } from "react";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import {
  CollectionBrowser,
  CollectionBrowserInner,
} from "embedding-sdk-bundle/components/public/CollectionBrowser/CollectionBrowser";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { useLocale } from "metabase/common/hooks/use-locale";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

const useLocaleMock = useLocale as jest.Mock;

const BOBBY_TEST_COLLECTION = createMockCollection({
  archived: false,
  can_write: true,
  description: null,
  id: 1,
  location: "/",
  name: "Bobby Tables's Personal Collection",
  personal_owner_id: 100,
});

const ROOT_TEST_COLLECTION = createMockCollection({
  ...ROOT_COLLECTION,
  can_write: false,
  effective_ancestors: [],
  id: "root",
});

const TEST_COLLECTIONS = [ROOT_TEST_COLLECTION, BOBBY_TEST_COLLECTION];

describe("CollectionBrowser", () => {
  it("should render a loader when a locale is loading", async () => {
    useLocaleMock.mockReturnValue({ isLocaleLoading: true });
    const state = setupSdkState();

    renderWithSDKProviders(<CollectionBrowser collectionId="root" />, {
      sdkProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should render", async () => {
    await setup();

    await waitFor(() => {
      expect(screen.getByText("Type")).toBeInTheDocument();
    });

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Last edited by")).toBeInTheDocument();
    expect(screen.getByText("Last edited at")).toBeInTheDocument();
  });

  it("should allow to hide certain columns", async () => {
    await setup({
      props: {
        visibleColumns: ["type", "name"],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("items-table-head")).toBeInTheDocument();
    });

    const columnNames: (string | null)[] = [];

    within(screen.getByTestId("items-table-head"))
      .getAllByRole("button")
      .forEach((el) => {
        columnNames.push(el.textContent);
      });

    expect(columnNames).toStrictEqual(["Type", "Name"]);
  });
});

async function setup({
  props,
}: {
  props?: Partial<ComponentProps<typeof CollectionBrowserInner>>;
} = {}) {
  useLocaleMock.mockReturnValue({ isLocaleLoading: false });

  setupCollectionsEndpoints({
    collections: TEST_COLLECTIONS,
    rootCollection: ROOT_TEST_COLLECTION,
  });

  setupCollectionItemsEndpoint({
    collection: ROOT_TEST_COLLECTION,
    collectionItems: [
      createMockCollectionItem({ id: 2, model: "dashboard" }),
      createMockCollectionItem({ id: 3, model: "card" }),
    ],
  });

  const state = setupSdkState();

  renderWithSDKProviders(
    <CollectionBrowserInner collectionId="root" {...props} />,
    {
      sdkProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  expect(await screen.findByTestId("collection-table")).toBeInTheDocument();

  await waitFor(() => {
    expect(
      fetchMock.callHistory.calls(
        `path:/api/collection/${ROOT_TEST_COLLECTION.id}/items`,
      ),
    ).toHaveLength(1);
  });
}
