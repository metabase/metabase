/* istanbul ignore file */

import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  waitForElementToBeRemoved,
  screen,
} from "__support__/ui";
import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { TokenFeatures, User } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockNativeQuerySnippet,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SnippetSidebar } from "../SnippetSidebar";

const ROOT_COLLECTION = createMockCollection({ id: "root", can_write: true });
const MOCK_SNIPPET = createMockNativeQuerySnippet();

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
  user?: Partial<User>;
}

export async function setup({
  tokenFeatures = {},
  hasEnterprisePlugins = false,
  user = { is_superuser: true },
}: SetupOpts = {}) {
  setupNativeQuerySnippetEndpoints({ snippets: [MOCK_SNIPPET] });
  setupCollectionsEndpoints({
    collections: [ROOT_COLLECTION],
    rootCollection: ROOT_COLLECTION,
  });
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems: [
      createMockCollectionItem({ model: "snippet", ...MOCK_SNIPPET }),
    ],
    models: ["collection", "snippet"],
  });

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <SnippetSidebar
      onClose={() => null}
      setModalSnippet={() => null}
      openSnippetModalWithSelectedText={() => null}
      insertSnippet={() => null}
      snippetCollectionId={null}
      user={createMockUser(user)}
    />,
    {
      storeInitialState: state,
    },
  );
  await waitForElementToBeRemoved(() => screen.queryAllByText(/loading/i));
}
