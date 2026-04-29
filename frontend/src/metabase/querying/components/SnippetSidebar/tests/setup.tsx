/* istanbul ignore file */

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { waitForLoaderToBeRemoved } from "__support__/ui";
import type { TokenFeatures, User } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockNativeQuerySnippet,
  createMockUser,
} from "metabase-types/api/mocks";

import { SnippetSidebar } from "../SnippetSidebar";

const ROOT_COLLECTION = createMockCollection({ id: "root" });
const MOCK_SNIPPET = createMockNativeQuerySnippet();

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
  user?: Partial<User>;
}

export async function setup({
  tokenFeatures = {},
  enterprisePlugins,
  user = { is_superuser: true },
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

  const builder = createScenario();
  if (enterprisePlugins || Object.keys(tokenFeatures).length > 0) {
    builder.withEnterprise({ plugins: enterprisePlugins, tokenFeatures });
  }
  const { render } = builder.build();

  render(
    <SnippetSidebar
      onClose={() => null}
      setModalSnippet={() => null}
      openSnippetModalWithSelectedText={() => null}
      insertSnippet={() => null}
      snippetCollectionId={null}
      user={createMockUser(user)}
    />,
  );
  await waitForLoaderToBeRemoved();
}
