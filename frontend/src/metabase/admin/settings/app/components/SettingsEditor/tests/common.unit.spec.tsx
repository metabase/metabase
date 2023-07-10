import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup } from "./setup";

const FULL_APP_EMBEDDING_URL =
  "/admin/settings/embedding-in-other-applications/full-app";

describe("SettingsEditor", () => {
  describe("full-app embedding", () => {
    it("should show info about full app embedding", async () => {
      setup({
        settings: [createMockSettingDefinition({ key: "enable-embedding" })],
        settingValues: createMockSettings({ "enable-embedding": true }),
        initialRoute: FULL_APP_EMBEDDING_URL,
      });

      expect(await screen.findByText("Full-app embedding")).toBeInTheDocument();
      expect(screen.getByText(/some of our paid plans/)).toBeInTheDocument();
      expect(screen.queryByText("Authorized origins")).not.toBeInTheDocument();
    });
  });
});
