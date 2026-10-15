import { setupSdkPlugins } from "__support__/enterprise";
import { setupLibraryEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { PLUGIN_LIBRARY, reinitialize } from "metabase/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

describe("SDK plugins", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should give the embedding data pickers the Library", async () => {
    mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    });
    setupSdkPlugins();
    setupLibraryEndpoints({ hasLibrary: true });

    const { result } = renderHookWithProviders(
      () => PLUGIN_LIBRARY.useGetLibraryCollection(),
      {},
    );

    await waitFor(() => expect(result.current.data?.name).toBe("Library"));
  });
});
