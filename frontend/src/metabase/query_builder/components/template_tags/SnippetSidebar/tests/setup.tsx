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
import { TokenFeatures } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockNativeQuerySnippet,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SnippetSidebar } from "../SnippetSidebar";

const ROOT_COLLECTION = createMockCollection({ id: "root" });
const MOCK_SNIPPET = createMockNativeQuerySnippet();

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
}

export async function setup({
  tokenFeatures = {},
  hasEnterprisePlugins = false,
}: SetupOpts = {}) {
  setupNativeQuerySnippetEndpoints({ snippets: [MOCK_SNIPPET] });
  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems: [
      createMockCollectionItem({ model: "snippet", ...MOCK_SNIPPET }),
    ],
    models: ["collection", "snippet"],
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
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures(tokenFeatures),
        }),
      }),
    },
  );
  await waitForElementToBeRemoved(() => screen.queryAllByText(/loading/i));
}
