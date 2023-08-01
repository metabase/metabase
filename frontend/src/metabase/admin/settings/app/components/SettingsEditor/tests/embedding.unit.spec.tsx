import userEvent from "@testing-library/user-event";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupEmbedding = async (opts?: SetupOpts) => {
  await setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      embedding: true,
    }),
    hasEnterprisePlugins: true,
  });
};

describe("SettingsEditor", () => {
  it("should allow to configure the origin for full-app embedding", async () => {
    await setupEmbedding({
      settings: [
        createMockSettingDefinition({ key: "enable-embedding" }),
        createMockSettingDefinition({ key: "embedding-app-origin" }),
      ],
      settingValues: createMockSettings({
        "enable-embedding": true,
      }),
    });

    userEvent.click(screen.getByText("Embedding"));
    userEvent.click(screen.getByText("Full-app embedding"));
    expect(screen.getByText("Full-app embedding")).toBeInTheDocument();
    expect(screen.getByText("Authorized origins")).toBeInTheDocument();
    expect(
      screen.queryByText(/some of our paid plans/),
    ).not.toBeInTheDocument();
  });
});
