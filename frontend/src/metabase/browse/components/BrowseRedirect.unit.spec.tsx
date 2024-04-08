import { replace } from "react-router-redux";

import { setupSearchEndpoints } from "__support__/server-mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
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
  defaultTab: string | null;
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
  it("redirects to /browse/databases if there are no models and no saved setting", async () => {
    const { store } = setup({ models: [], defaultTab: null });
    const mockDispatch = jest.spyOn(store, "dispatch");
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/databases"));
    });
  });
  it("redirects to /browse/models if there are some models but no saved setting", async () => {
    const { store } = setup({ models: mockModels, defaultTab: null });
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
  it("redirects to /browse/databases if the user's defaultBrowseBab setting is 'databases'", async () => {
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
  it("redirects to /browse/models if the user has an invalid defaultBrowseTab setting, and some models exist", async () => {
    const { store, rerender } = setup({
      models: mockModels,
      defaultTab: "this is an invalid value",
    });
    const mockDispatch = jest.spyOn(store, "dispatch");
    rerender(<BrowseRedirect />);
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/models"));
    });
  });
});
