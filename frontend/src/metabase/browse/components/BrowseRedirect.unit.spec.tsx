import { replace } from "react-router-redux";
import { renderWithProviders, waitFor } from "__support__/ui";
import { setupSearchEndpoints } from "__support__/server-mocks";
import type { SearchResult } from "metabase-types/api";
import { createMockModelResult } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { mockSettings } from "__support__/settings";
import { BrowseRedirect } from "./BrowseRedirect";

const mockModels: SearchResult[] = [
  {
    id: 0,
    name: "Model 0",
    collection: { id: 0, name: "Alpha" },
  },
  {
    id: 1,
    name: "Model 1",
    collection: { id: 0, name: "Alpha" },
  },
].map(model => createMockModelResult(model));

describe("BrowseRedirect", () => {
  it("if there is no saved user setting, redirects to /databases if there are no models", async () => {
    const models: SearchResult[] = [];
    setupSearchEndpoints(models);
    const { store } = renderWithProviders(<BrowseRedirect />);
    const mockDispatch = jest.spyOn(store, "dispatch");
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/databases"));
    });
  });
  it("if there is no saved user setting, redirects to /models if there are some models", async () => {
    const models = mockModels.slice(0, 1);
    setupSearchEndpoints(models);
    const { store } = renderWithProviders(<BrowseRedirect />);
    const mockDispatch = jest.spyOn(store, "dispatch");
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/models"));
    });
  });
  it("redirects to /models if the user has a default-browse-tab setting set to 'models'", async () => {
    const models: SearchResult[] = [];
    setupSearchEndpoints(models);
    // Render nothing at first. Just prepare the store
    const { store, rerender } = renderWithProviders(<></>, {
      storeInitialState: createMockState({
        settings: mockSettings({
          "default-browse-tab": "models",
        }),
      }),
    });
    const mockDispatch = jest.spyOn(store, "dispatch");
    // Render the component after dispatch has been mocked
    rerender(<BrowseRedirect />);
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/models"));
    });
  });
});
