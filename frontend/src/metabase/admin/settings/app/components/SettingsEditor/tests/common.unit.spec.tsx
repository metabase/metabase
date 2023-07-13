import userEvent from "@testing-library/user-event";
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
      });

      userEvent.click(await screen.findByText("Embedding"));
      userEvent.click(screen.getByText("Full-app embedding"));
      expect(screen.getByText(/some of our paid plans/)).toBeInTheDocument();
      expect(screen.queryByText("Authorized origins")).not.toBeInTheDocument();
    });

    it("should redirect from the full-app embedding page if embedding is not enabled", async () => {
      setup({
        settings: [createMockSettingDefinition({ key: "enable-embedding" })],
        settingValues: createMockSettings({ "enable-embedding": false }),
        initialRoute: FULL_APP_EMBEDDING_URL,
      });

      expect(
        await screen.findByText(/Embed dashboards, questions/),
      ).toBeInTheDocument();
      expect(screen.queryByText("Full-app embedding")).not.toBeInTheDocument();
    });
  });
});
