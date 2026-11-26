import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  setupCollectionByIdEndpoint,
  setupEditableNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Link, Outlet, Route } from "metabase/router";
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
  setupEditableNativeQuerySnippetEndpoints(mockSnippet);
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
    <Route element={<LayoutWithOtherPageLink />}>
      <Route element={<EditSnippetPage />} path="/snippets/:snippetId" />
      <Route element={<div>Other page</div>} path="/other" />
    </Route>,
    {
      initialRoute: `/snippets/${mockSnippet.id}`,
      storeInitialState: state,
      withRouter: true,
      withUndos: true,
    },
  );

  expect(await screen.findByTestId("edit-snippet-page")).toBeInTheDocument();

  return { snippet: mockSnippet };
};

function LayoutWithOtherPageLink() {
  return (
    <>
      <Link to="/other">Other page link</Link>
      <Outlet />
    </>
  );
}

export const DEFAULT_EE_SETTINGS: Partial<SetupOps> = {
  enterprisePlugins: ["library", "remote_sync"],
  tokenFeatures: {
    library: true,
    remote_sync: true,
  },
};
