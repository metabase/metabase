import userEvent from "@testing-library/user-event";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import type { SetupOpts } from "./setup";
import { setup } from "./setup";

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
  it("should allow to configure the origin and SameSite cookie setting for interactive embedding", async () => {
    await setupEmbedding({
      settings: [
        createMockSettingDefinition({ key: "enable-embedding" }),
        createMockSettingDefinition({ key: "embedding-app-origin" }),
        createMockSettingDefinition({ key: "session-cookie-samesite" }),
      ],
      settingValues: createMockSettings({
        "enable-embedding": true,
        "session-cookie-samesite": "lax",
      }),
    });

    userEvent.click(screen.getByText("Embedding"));
    userEvent.click(screen.getByText("Interactive embedding"));
    expect(screen.getByText("Interactive embedding")).toBeInTheDocument();

    expect(screen.getByText("Authorized origins")).toBeInTheDocument();
    expect(screen.getByText("SameSite cookie setting")).toBeInTheDocument();

    expect(
      screen.queryByText(/some of our paid plans/),
    ).not.toBeInTheDocument();
  });
});
