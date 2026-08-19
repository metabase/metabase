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
  hasFullAppEmbedding?: boolean;
  envSettingKeys?: (keyof Settings)[];
  showEmbedTerms?: boolean;
} & Partial<
  Pick<Settings, "enable-embedding-modular" | "enable-embedding-interactive">
>;

async function setup({
  hasSimpleEmbedding = true,
  hasFullAppEmbedding = hasSimpleEmbedding,
  envSettingKeys = [],
  showEmbedTerms = false,
  ...values
}: SetupOpts = {}) {
  const settingValues = createMockSettings({
    "enable-embedding-modular": false,
    "enable-embedding-interactive": false,
    "show-modular-embed-terms": showEmbedTerms,
    "token-features": createMockTokenFeatures({
      embedding_simple: hasSimpleEmbedding,
      embedding: hasFullAppEmbedding,
    }),
    ...values,
  });

  const definitions = (
    ["enable-embedding-modular", "enable-embedding-interactive"] as const
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

  it("shows only full-app embedding when that is the only feature on the token", async () => {
    await setup({ hasSimpleEmbedding: false, hasFullAppEmbedding: true });

    expect(await screen.findByText("Full-app embedding")).toBeInTheDocument();
    expect(screen.queryByText(MERGED_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText(OSS_LABEL)).not.toBeInTheDocument();
  });

  describe("the merged switch", () => {
    it("reads on when enable-embedding-modular is on", async () => {
      await setup({ "enable-embedding-modular": true });

      // The merged row comes first, full-app second.
      const [mergedSwitch] = await screen.findAllByRole("switch");
      expect(mergedSwitch).toBeChecked();
    });

    it("reads off when enable-embedding-modular is off", async () => {
      await setup();

      const [mergedSwitch] = await screen.findAllByRole("switch");
      expect(mergedSwitch).not.toBeChecked();
    });

    it("writes the one setting the three methods now share", async () => {
      await setup();

      const [mergedSwitch] = await screen.findAllByRole("switch");
      await userEvent.click(mergedSwitch);

      await waitFor(async () => {
        expect(await findRequests("PUT")).toHaveLength(1);
      });

      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({ "enable-embedding-modular": true });
    });

    it("asks the admin to accept the terms before turning embedding on", async () => {
      await setup({ showEmbedTerms: true });

      const [mergedSwitch] = await screen.findAllByRole("switch");
      await userEvent.click(mergedSwitch);

      expect(
        await screen.findByText(
          "Each end user needs their own Metabase account",
        ),
      ).toBeInTheDocument();
      expect(await findRequests("PUT")).toHaveLength(0);
    });

    // The terms are about paid methods and about shared accounts as unfair use
    // of a paid seat, so guest embeds below the paywall never trigger them.
    it("does not ask an OSS admin to accept the terms", async () => {
      await setup({ hasSimpleEmbedding: false, showEmbedTerms: true });

      const [guestSwitch] = await screen.findAllByRole("switch");
      await userEvent.click(guestSwitch);

      await waitFor(async () => {
        expect(await findRequests("PUT")).toHaveLength(1);
      });

      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({ "enable-embedding-modular": true });
      expect(
        screen.queryByText("Each end user needs their own Metabase account"),
      ).not.toBeInTheDocument();
    });

    it("locks the row when the setting is pinned to an env var", async () => {
      await setup({ envSettingKeys: ["enable-embedding-modular"] });

      expect(
        await screen.findByText("Set via environment variable"),
      ).toBeInTheDocument();
    });
  });
});
