import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  setup({ ...opts, hasEnterprisePlugins: true });
};

const FULL_APP_EMBEDDING_URL =
  "/admin/settings/embedding-in-other-applications/full-app";

describe("SettingsEditor", () => {
  describe("full-app embedding", () => {
    it("should show info about full app embedding", async () => {
      setupEnterprise({
        settings: [
          createMockSettingDefinition({ key: "enable-embedding" }),
          createMockSettingDefinition({ key: "embedding-app-origin" }),
        ],
        settingValues: createMockSettings({ "enable-embedding": true }),
        initialRoute: FULL_APP_EMBEDDING_URL,
      });

      expect(await screen.findByText("Full-app embedding")).toBeInTheDocument();
      expect(screen.getByText(/some of our paid plans/)).toBeInTheDocument();
      expect(screen.queryByText("Authorized origins")).not.toBeInTheDocument();
    });
  });
});
