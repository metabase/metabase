import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
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

import { SnippetHeader } from "./SnippetHeader";

type SetupOps = {
  snippet?: Partial<NativeQuerySnippet>;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

const setup = ({ snippet = {}, remoteSyncType }: SetupOps) => {
  const mockSnippet = createMockNativeQuerySnippet(snippet);

  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection({ id: "root", name: "Our analytics" }),
      createMockCollection({
        id: 10,
        name: "My folder",
        effective_ancestors: [createMockCollection({ id: "root" })],
      }),
    ],
  });

  const tokenFeatures: Partial<TokenFeatures> = {
    remote_sync: !!remoteSyncType,
  };
  const settings = mockSettings({
    "remote-sync-type": remoteSyncType,
    "remote-sync-enabled": !!remoteSyncType,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  const state = createMockState({
    settings,
  });

  const enterprisePlugins: ENTERPRISE_PLUGIN_NAME[] = ["remote_sync"];
  enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <SnippetHeader
          snippet={mockSnippet}
          actions={<div data-testid="custom-actions" />}
        />
      )}
    />,
    {
      storeInitialState: state,
      withRouter: true,
    },
  );
};

describe("SnippetHeader", () => {
  it("renders header with input, menu and actions", () => {
    setup({ snippet: { name: "Batman's snippet" } });

    expect(screen.getByRole("textbox")).toBeEnabled();
    expect(screen.getByRole("textbox")).toHaveValue("Batman's snippet");
    expect(
      screen.getByRole("button", { name: "Snippet menu options" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("custom-actions")).toBeInTheDocument();
  });

  describe("breadcrumbs", () => {
    it("does not show 'Our analytics' for a snippet in the root folder (metabase#UXW-4170)", async () => {
      setup({ snippet: { name: "My Snippet", collection_id: null } });

      expect(
        await screen.findByRole("link", { name: "SQL snippets" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Our analytics" }),
      ).not.toBeInTheDocument();
    });

    it("shows the folder path for a snippet inside a folder", async () => {
      setup({ snippet: { name: "My Snippet", collection_id: 10 } });

      expect(
        await screen.findByRole("link", { name: "SQL snippets" }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("link", { name: "My folder" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Our analytics" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("when remote sync is set to read-only", () => {
    beforeEach(() => {
      setup({
        snippet: { name: "Batman's snippet" },
        remoteSyncType: "read-only",
      });
    });

    it("renders input as disabled", () => {
      expect(screen.getByRole("textbox")).toBeDisabled();
    });

    it("renders no menu", () => {
      expect(
        screen.queryByRole("button", { name: "Snippet menu options" }),
      ).not.toBeInTheDocument();
    });
  });
});
