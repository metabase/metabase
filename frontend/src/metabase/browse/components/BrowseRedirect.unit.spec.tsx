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

const setup = ({ models }: { models: SearchResult[] }) => {
  setupSearchEndpoints(models);
  return renderWithProviders(<BrowseRedirect />);
};

describe("BrowseRedirect", () => {
  it("redirects to /browse/databases if there are no models", async () => {
    const { store } = setup({ models: [] });
    const mockDispatch = jest.spyOn(store, "dispatch");
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/databases"));
    });
  });
  it("redirects to /browse/models if there are some models", async () => {
    const { store } = setup({ models: mockModels });
    const mockDispatch = jest.spyOn(store, "dispatch");
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(replace("/browse/models"));
    });
  });
  // NOTE: Default tab functionality is covered in e2e tests
});
