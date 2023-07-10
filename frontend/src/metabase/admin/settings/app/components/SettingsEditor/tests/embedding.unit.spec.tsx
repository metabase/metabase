import userEvent from "@testing-library/user-event";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      embedding: true,
    }),
    hasEnterprisePlugins: true,
  });
};

describe("SettingsEditor", () => {
  it("should allow to configure the origin for full-app embedding", async () => {
    setupEnterprise({
      settings: [
        createMockSettingDefinition({ key: "enable-embedding" }),
        createMockSettingDefinition({ key: "embedding-app-origin" }),
      ],
      settingValues: createMockSettings({
        "enable-embedding": true,
      }),
    });

    userEvent.click(await screen.findByText("Embedding"));
    userEvent.click(screen.getByText("Full-app embedding"));
    expect(screen.getByText("Authorized origins")).toBeInTheDocument();
    expect(
      screen.queryByText(/some of our paid plans/),
    ).not.toBeInTheDocument();
  });
});
