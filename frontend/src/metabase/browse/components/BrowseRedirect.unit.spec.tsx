import { replace } from "react-router-redux";
import { renderWithProviders, waitFor } from "__support__/ui";
import {
  setupPropertiesEndpoints,
  setupSearchEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import type { SearchResult, Settings } from "metabase-types/api";
import {
  createMockModelResult,
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
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

const setup = ({
  models,
  defaultTab,
}: {
  models: SearchResult[];
  defaultTab: Settings["default-browse-tab"];
}) => {
  setupSearchEndpoints(models);
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([createMockSettingDefinition()]);
  return renderWithProviders(<BrowseRedirect />, {
    storeInitialState: createMockState({
      settings: mockSettings({
        "default-browse-tab": defaultTab,
      }),
    }),
  });
};

describe("BrowseRedirect", () => {
  it("redirects to /databases if there are no models and no saved setting", async () => {
    const { store } = setup({ models: [], defaultTab: null });
    const mockDispatch = jest.spyOn(store, "dispatch");
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/databases"));
    });
  });
  it("redirects to /models if there are some models but no saved setting", async () => {
    const { store } = setup({ models: mockModels, defaultTab: null });
    const mockDispatch = jest.spyOn(store, "dispatch");
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/models"));
    });
  });

  it("redirects to /models if the user's default-browse-tab setting = 'models'", async () => {
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
  it("redirects to /browse/databases if the user has a default-browse-tab setting set to 'databases'", async () => {
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
  it("redirects to /browse/models if the user has an invalid default-browse-tab setting and some models exist", async () => {
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
