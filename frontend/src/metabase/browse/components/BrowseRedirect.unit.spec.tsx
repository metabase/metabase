import { replace } from "react-router-redux";
import { renderWithProviders, waitFor } from "__support__/ui";
import { setupSearchEndpoints } from "__support__/server-mocks";
import type { SearchResult } from "metabase-types/api";
import { createMockModelResult } from "metabase-types/api/mocks";
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

const setup = ({
  models,
  defaultTab = null,
}: {
  models: SearchResult[];
  defaultTab?: string | null;
}) => {
  setupSearchEndpoints(models);
  if (defaultTab === null) {
    localStorage.removeItem("defaultBrowseTab");
  } else {
    localStorage.setItem("defaultBrowseTab", defaultTab);
  }
  return renderWithProviders(<BrowseRedirect />);
};

describe("BrowseRedirect", () => {
  it("if there is no saved user setting, redirects to /databases if there are no models", async () => {
    const { store } = setup({ models: [] });
    const mockDispatch = jest.spyOn(store, "dispatch");
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/databases"));
    });
  });
  it("if there is no saved user setting, redirects to /models if there are some models", async () => {
    const { store } = setup({ models: mockModels.slice(0, 1) });
    const mockDispatch = jest.spyOn(store, "dispatch");
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/models"));
    });
  });

  it("redirects to /browse/models if the user's defaultBrowseTab setting is 'models'", async () => {
    const { store, rerender } = setup({
      models: [],
      defaultTab: "models",
    });
    const mockDispatch = jest.spyOn(store, "dispatch");
    rerender(<BrowseRedirect />);
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/models"));
    });
  });
  it("redirects to /browse/databases if the user's defaultBrowseTab setting is 'databases'", async () => {
    const { store, rerender } = setup({
      models: mockModels,
      defaultTab: "databases",
    });
    const mockDispatch = jest.spyOn(store, "dispatch");
    rerender(<BrowseRedirect />);
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/databases"));
    });
  });
});
