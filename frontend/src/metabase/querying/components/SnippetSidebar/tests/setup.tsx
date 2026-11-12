/* istanbul ignore file */

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import type {
  Collection,
  CollectionId,
  CollectionItem,
  EnterpriseSettings,
  NativeQuerySnippet,
  TokenFeatures,
  User,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockNativeQuerySnippet,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { SnippetSidebar } from "../SnippetSidebar";

export const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Snippets",
  namespace: "snippets",
  can_write: true,
});
const MOCK_SNIPPET = createMockNativeQuerySnippet();

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  user?: Partial<User>;
  snippets?: NativeQuerySnippet[];
  collections?: Collection[];
  collectionItems?: Partial<Record<CollectionId, CollectionItem[]>>;
  snippetCollectionId?: CollectionId | null;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
}

export function createSnippetCollectionItem(
  snippet: NativeQuerySnippet,
): CollectionItem {
  return createMockCollectionItem({ ...snippet, model: "snippet" });
}

export function createFolderCollectionItem(
  collection: Collection,
): CollectionItem {
  if (typeof collection.id !== "number") {
    throw new Error("A snippet folder item needs a numeric collection id");
  }
  return createMockCollectionItem({
    id: collection.id,
    name: collection.name,
    model: "collection",
  });
}

export async function setup({
  tokenFeatures = {},
  enterprisePlugins,
  user = { is_superuser: true },
  snippets = [MOCK_SNIPPET],
  collections = [],
  collectionItems = { root: snippets.map(createSnippetCollectionItem) },
  snippetCollectionId = null,
  remoteSyncType,
}: SetupOpts = {}) {
  const allCollections = [ROOT_COLLECTION, ...collections];

  setupNativeQuerySnippetEndpoints({ snippets });
  setupCollectionsEndpoints({
    collections: allCollections,
    rootCollection: ROOT_COLLECTION,
  });
  setupCollectionByIdEndpoint({ collections: allCollections });
  allCollections.forEach((collection) =>
    setupCollectionItemsEndpoint({
      collection,
      collectionItems: collectionItems[collection.id] ?? [],
      models: ["collection", "snippet"],
    }),
  );

  const state = createMockState({
    currentUser: createMockUser(user),
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
      "remote-sync-enabled": remoteSyncType != null,
      "remote-sync-type": remoteSyncType,
    }),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  const openSnippetModalWithSelectedText = jest.fn<void, []>();
  const insertSnippet = jest.fn<void, [NativeQuerySnippet]>();
  const setModalSnippet = jest.fn<void, [NativeQuerySnippet]>();
  const setSnippetCollectionId = jest.fn<void, [CollectionId | null]>();

  const utils = renderWithProviders(
    <SnippetSidebar
      onClose={() => null}
      setModalSnippet={setModalSnippet}
      openSnippetModalWithSelectedText={openSnippetModalWithSelectedText}
      insertSnippet={insertSnippet}
      snippetCollectionId={snippetCollectionId}
      setSnippetCollectionId={setSnippetCollectionId}
    />,
    {
      storeInitialState: state,
    },
  );
  await waitForLoaderToBeRemoved();

  return {
    ...utils,
    openSnippetModalWithSelectedText,
    insertSnippet,
    setModalSnippet,
    setSnippetCollectionId,
  };
}
