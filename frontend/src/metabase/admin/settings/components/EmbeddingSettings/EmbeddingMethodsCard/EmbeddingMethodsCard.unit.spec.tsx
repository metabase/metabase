import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Settings } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { EmbeddingMethodsCard } from "./EmbeddingMethodsCard";

const MERGED_LABEL = "Modular embedding and SDK for React";
const OSS_LABEL = "Enable embedding";

type SetupOpts = {
  hasSimpleEmbedding?: boolean;
  envSettingKeys?: (keyof Settings)[];
} & Partial<
  Pick<
    Settings,
    | "enable-embedding-simple"
    | "enable-embedding-sdk"
    | "enable-embedding-static"
    | "enable-embedding-interactive"
  >
>;

async function setup({
  hasSimpleEmbedding = true,
  envSettingKeys = [],
  ...values
}: SetupOpts = {}) {
  const settingValues = createMockSettings({
    "enable-embedding-simple": false,
    "enable-embedding-sdk": false,
    "enable-embedding-static": false,
    "enable-embedding-interactive": false,
    "show-simple-embed-terms": false,
    "token-features": createMockTokenFeatures({
      embedding_simple: hasSimpleEmbedding,
    }),
    ...values,
  });

  const definitions = (
    [
      "enable-embedding-simple",
      "enable-embedding-sdk",
      "enable-embedding-static",
      "enable-embedding-interactive",
    ] as const
  ).map((key) =>
    createMockSettingDefinition({
      key,
      value: settingValues[key],
      is_env_setting: envSettingKeys.includes(key),
    }),
  );

  setupSettingsEndpoints(definitions);
  setupPropertiesEndpoints(settingValues);
  setupUpdateSettingsEndpoint();

  renderWithProviders(<EmbeddingMethodsCard />, {
    storeInitialState: createMockState({
      settings: mockSettings(settingValues),
    }),
  });

  await waitFor(async () => {
    expect(await findRequests("GET")).not.toHaveLength(0);
  });
}

describe("EmbeddingMethodsCard", () => {
  it("presents modular embedding, the SDK and guest embeds as one method", async () => {
    await setup();

    expect(await screen.findByText(MERGED_LABEL)).toBeInTheDocument();
    expect(screen.getByText("Full-app embedding")).toBeInTheDocument();

    expect(screen.queryByText("Modular embedding SDK")).not.toBeInTheDocument();
    expect(screen.queryByText(OSS_LABEL)).not.toBeInTheDocument();
  });

  it("shows only guest embeds on OSS, where the paid methods cannot run", async () => {
    await setup({ hasSimpleEmbedding: false });

    expect(await screen.findByText(OSS_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(MERGED_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText("Full-app embedding")).not.toBeInTheDocument();
  });

  describe("the merged switch", () => {
    it.each([
      "enable-embedding-simple",
      "enable-embedding-sdk",
      "enable-embedding-static",
    ] as const)("reads on when only %s is on", async (settingKey) => {
      await setup({ [settingKey]: true });

      // The merged row comes first, full-app second.
      const [mergedSwitch] = await screen.findAllByRole("switch");
      expect(mergedSwitch).toBeChecked();
    });

    it("reads off only when all three are off", async () => {
      await setup();

      const switches = await screen.findAllByRole("switch");
      expect(switches[0]).not.toBeChecked();
    });

    it("writes all three settings at once", async () => {
      await setup();

      const switches = await screen.findAllByRole("switch");
      await userEvent.click(switches[0]);

      await waitFor(async () => {
        expect(await findRequests("PUT")).toHaveLength(1);
      });

      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({
        "enable-embedding-simple": true,
        "enable-embedding-sdk": true,
        "enable-embedding-static": true,
      });
    });

    it("locks the row when any of the three is pinned to an env var", async () => {
      await setup({ envSettingKeys: ["enable-embedding-sdk"] });

      expect(
        await screen.findByText("Set via environment variable"),
      ).toBeInTheDocument();
    });
  });
});
