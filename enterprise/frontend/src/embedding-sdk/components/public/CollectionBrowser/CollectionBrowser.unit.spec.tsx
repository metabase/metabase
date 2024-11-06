import type { ComponentProps } from "react";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { CollectionBrowserInner } from "embedding-sdk/components/public/CollectionBrowser/CollectionBrowser";
import { createMockJwtConfig } from "embedding-sdk/test/mocks/config";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

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
  it("should render", async () => {
    await setup();

    expect(screen.getByText("Type")).toBeInTheDocument();
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

    const columnNames: (string | null)[] = [];

    within(screen.getByTestId("items-table-head"))
      .getAllByRole("button")
      .forEach(el => {
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

  renderWithProviders(<CollectionBrowserInner {...props} />, {
    mode: "sdk",
    sdkProviderProps: {
      config: createMockJwtConfig({
        jwtProviderUri: "http://TEST_URI/sso/metabase",
      }),
    },
    storeInitialState: state,
  });

  expect(await screen.findByTestId("collection-table")).toBeInTheDocument();
}
