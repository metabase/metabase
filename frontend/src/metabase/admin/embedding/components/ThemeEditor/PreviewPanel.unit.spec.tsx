import {
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockSearchResult } from "metabase-types/api/mocks";

import { PreviewPanel } from "./PreviewPanel";
import type { PreviewResource } from "./types";

jest.mock("./ResourcePreview", () => ({
  ResourcePreview: ({ resource }: { resource: PreviewResource }) => (
    <div
      data-testid="resource-preview"
      data-resource-model={resource.model}
      data-resource-id={resource.id}
    >
      {resource.name}
    </div>
  ),
}));

const setup = ({
  searchItems = [],
}: {
  searchItems?: Parameters<typeof setupSearchEndpoints>[0];
} = {}) => {
  setupRecentViewsEndpoints([]);
  setupSearchEndpoints(searchItems);

  const storeInitialState = createMockState({
    settings: mockSettings({
      "enable-embedding-simple": true,
      "show-simple-embed-terms": false,
    }),
  });

  return renderWithProviders(<PreviewPanel settings={{} as MetabaseTheme} />, {
    storeInitialState,
  });
};

describe("PreviewPanel", () => {
  it("falls back to a question when no dashboard exists", async () => {
    setup({
      searchItems: [
        createMockSearchResult({
          id: 200,
          model: "card",
          name: "Only question",
        }),
      ],
    });

    const preview = await screen.findByTestId("resource-preview");
    expect(preview).toHaveAttribute("data-resource-model", "card");
    expect(preview).toHaveAttribute("data-resource-id", "200");
    expect(preview).toHaveTextContent("Only question");
    expect(
      screen.getByRole("button", { name: "Change preview resource" }),
    ).toHaveTextContent("Only question");
  });

  it("shows the empty-state message when no resource is available", async () => {
    setup({ searchItems: [] });

    expect(
      await screen.findByText(
        "Create a dashboard or question to preview this theme.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("resource-preview")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change preview resource" }),
    ).not.toBeInTheDocument();
  });
});
