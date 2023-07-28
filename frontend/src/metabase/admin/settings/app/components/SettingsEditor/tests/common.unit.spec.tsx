import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup } from "./setup";

const FULL_APP_EMBEDDING_URL =
  "/admin/settings/embedding-in-other-applications/Interactive";

describe("SettingsEditor", () => {
  describe("Interactive embedding", () => {
    it("should show info about Interactive embedding", async () => {
      setup({
        settings: [createMockSettingDefinition({ key: "enable-embedding" })],
        settingValues: createMockSettings({ "enable-embedding": true }),
        initialRoute: FULL_APP_EMBEDDING_URL,
      });

      expect(
        await screen.findByText("Interactive embedding"),
      ).toBeInTheDocument();
      expect(screen.getByText(/some of our paid plans/)).toBeInTheDocument();
      expect(screen.queryByText("Authorized origins")).not.toBeInTheDocument();
    });
  });
});
