import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ embedding: true }),
    hasEnterprisePlugins: true,
  });
};

const FULL_APP_EMBEDDING_URL =
  "/admin/settings/embedding-in-other-applications/full-app";

describe("SettingsEditor", () => {
  describe("full-app embedding", () => {
    it("should allow to configure the origin for full-app embedding", async () => {
      setupPremium({
        settings: [
          createMockSettingDefinition({ key: "enable-embedding" }),
          createMockSettingDefinition({ key: "embedding-app-origin" }),
        ],
        settingValues: createMockSettings({ "enable-embedding": true }),
        initialRoute: FULL_APP_EMBEDDING_URL,
      });

      expect(await screen.findByText("Full-app embedding")).toBeInTheDocument();
      expect(screen.getByText("Authorized origins")).toBeInTheDocument();
      expect(
        screen.queryByText(/some of our paid plans/),
      ).not.toBeInTheDocument();
    });
  });
});
