import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  setupCollectionByIdEndpoint,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  EnterpriseSettings,
  NativeQuerySnippet,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockNativeQuerySnippet,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { EditSnippetPage } from "../EditSnippetPage";

type SetupOps = {
  snippet?: Partial<NativeQuerySnippet>;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
  tokenFeatures?: Partial<TokenFeatures>;
};

export const setup = async ({
  snippet = {},
  remoteSyncType,
  enterprisePlugins,
  tokenFeatures,
}: SetupOps) => {
  const mockSnippet = createMockNativeQuerySnippet(snippet);
  setupNativeQuerySnippetEndpoints({ snippets: [mockSnippet] });
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });

  const settings = mockSettings({
    "remote-sync-type": remoteSyncType,
    "remote-sync-enabled": !!remoteSyncType,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  const state = createMockState({
    settings,
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithProviders(
    <Route component={EditSnippetPage} path="/snippets/:snippetId" />,
    {
      initialRoute: `/snippets/${mockSnippet.id}`,
      storeInitialState: state,
      withRouter: true,
    },
  );

  expect(await screen.findByTestId("edit-snippet-page")).toBeInTheDocument();
};

export const DEFAULT_EE_SETTINGS: Partial<SetupOps> = {
  enterprisePlugins: ["library", "remote_sync"],
  tokenFeatures: {
    library: true,
    remote_sync: true,
  },
};
