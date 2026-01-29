import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  EnterpriseSettings,
  NativeQuerySnippet,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockNativeQuerySnippet,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SnippetHeader } from "./SnippetHeader";

type SetupOps = {
  snippet?: Partial<NativeQuerySnippet>;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

const setup = ({ snippet = {}, remoteSyncType }: SetupOps) => {
  const mockSnippet = createMockNativeQuerySnippet(snippet);

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

  ["remote_sync"].forEach(setupEnterpriseOnlyPlugin);

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
