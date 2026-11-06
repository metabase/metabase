import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Settings } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { EmbeddingMethodsCard } from "./EmbeddingMethodsCard";

const MODULAR_EMBEDDING_LABEL = "Modular embedding";
const SDK_LABEL = "Modular embedding React SDK";
const OSS_LABEL = "Enable embedding";
const SIDECAR_LABEL = "Standalone Metabase linked from your app";

type SetupOpts = {
  hasSimpleEmbedding?: boolean;
  hasSdkEmbedding?: boolean;
  hasFullAppEmbedding?: boolean;
  envSettingKeys?: (keyof Settings)[];
  showEmbedTerms?: boolean;
} & Partial<
  Pick<
    Settings,
    | "enable-embedding-modular"
    | "enable-embedding-sdk"
    | "enable-embedding-interactive"
    | "enable-embedding-sidecar"
  >
>;

async function setup({
  hasSimpleEmbedding = true,
  hasSdkEmbedding = hasSimpleEmbedding,
  hasFullAppEmbedding = hasSimpleEmbedding,
  envSettingKeys = [],
  showEmbedTerms = false,
  ...values
}: SetupOpts = {}) {
  const settingValues = createMockSettings({
    "enable-embedding-modular": false,
    "enable-embedding-sdk": false,
    "enable-embedding-interactive": false,
    "enable-embedding-sidecar": false,
    "show-modular-embed-terms": showEmbedTerms,
    "token-features": createMockTokenFeatures({
      embedding_simple: hasSimpleEmbedding,
      embedding_sdk: hasSdkEmbedding,
      embedding: hasFullAppEmbedding,
    }),
    ...values,
  });

  const definitions = (
    [
      "enable-embedding-modular",
      "enable-embedding-sdk",
      "enable-embedding-interactive",
      "enable-embedding-sidecar",
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
  it("presents modular embedding, the React SDK, full-app and side-car embedding as separate methods", async () => {
    await setup();

    expect(
      await screen.findByText(MODULAR_EMBEDDING_LABEL),
    ).toBeInTheDocument();
    expect(screen.getByText(SDK_LABEL)).toBeInTheDocument();
    expect(screen.getByText("Full-app embedding")).toBeInTheDocument();
    expect(screen.getByText(SIDECAR_LABEL)).toBeInTheDocument();

    expect(screen.queryByText(OSS_LABEL)).not.toBeInTheDocument();
  });

  it("shows only guest embeds on OSS, where the paid methods cannot run", async () => {
    await setup({ hasSimpleEmbedding: false });

    expect(await screen.findByText(OSS_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(MODULAR_EMBEDDING_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText(SDK_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText("Full-app embedding")).not.toBeInTheDocument();
    expect(screen.queryByText(SIDECAR_LABEL)).not.toBeInTheDocument();
  });

  it("shows only full-app and side-car embedding when full-app is the only feature on the token", async () => {
    await setup({ hasSimpleEmbedding: false, hasFullAppEmbedding: true });

    expect(await screen.findByText("Full-app embedding")).toBeInTheDocument();
    expect(screen.getByText(SIDECAR_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(MODULAR_EMBEDDING_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText(SDK_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText(OSS_LABEL)).not.toBeInTheDocument();
  });

  describe("the modular embedding switch", () => {
    it("reads on when enable-embedding-modular is on", async () => {
      await setup({ "enable-embedding-modular": true });

      // The modular embedding row comes first, the React SDK second, full-app third.
      const [modularEmbeddingSwitch] = await screen.findAllByRole("switch");
      expect(modularEmbeddingSwitch).toBeChecked();
    });

    it("reads off when enable-embedding-modular is off", async () => {
      await setup();

      const [modularEmbeddingSwitch] = await screen.findAllByRole("switch");
      expect(modularEmbeddingSwitch).not.toBeChecked();
    });

    it("writes the one setting modular embedding and guest embeds share", async () => {
      await setup();

      const [modularEmbeddingSwitch] = await screen.findAllByRole("switch");
      await userEvent.click(modularEmbeddingSwitch);

      await waitFor(async () => {
        expect(await findRequests("PUT")).toHaveLength(1);
      });

      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({ "enable-embedding-modular": true });
    });

    it("asks the admin to accept the terms before turning embedding on", async () => {
      await setup({ showEmbedTerms: true });

      const [modularEmbeddingSwitch] = await screen.findAllByRole("switch");
      await userEvent.click(modularEmbeddingSwitch);

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

  describe("the React SDK switch", () => {
    it("writes enable-embedding-sdk, the setting only the React SDK uses", async () => {
      await setup();

      const [_modularEmbeddingSwitch, sdkSwitch] =
        await screen.findAllByRole("switch");
      await userEvent.click(sdkSwitch);

      await waitFor(async () => {
        expect(await findRequests("PUT")).toHaveLength(1);
      });

      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({ "enable-embedding-sdk": true });
    });

    it("asks the admin to accept the terms before turning the SDK on", async () => {
      await setup({ showEmbedTerms: true });

      const [_modularEmbeddingSwitch, sdkSwitch] =
        await screen.findAllByRole("switch");
      await userEvent.click(sdkSwitch);

      expect(
        await screen.findByText(
          "Each end user needs their own Metabase account",
        ),
      ).toBeInTheDocument();
      expect(await findRequests("PUT")).toHaveLength(0);
    });

    it("asks the admin to accept the terms when the React SDK is the only method on the token", async () => {
      await setup({
        hasSimpleEmbedding: false,
        hasSdkEmbedding: true,
        showEmbedTerms: true,
      });

      const [sdkSwitch] = await screen.findAllByRole("switch");
      await userEvent.click(sdkSwitch);

      expect(
        await screen.findByText(
          "Each end user needs their own Metabase account",
        ),
      ).toBeInTheDocument();
      expect(await findRequests("PUT")).toHaveLength(0);
    });
  });

  describe("the side-car switch", () => {
    it("writes enable-embedding-sidecar", async () => {
      await setup();

      const sidecarSwitch = await screen.findByRole("switch", {
        name: `${SIDECAR_LABEL} toggle`,
      });
      expect(sidecarSwitch).not.toBeChecked();

      await userEvent.click(sidecarSwitch);

      await waitFor(async () => {
        expect(await findRequests("PUT")).toHaveLength(1);
      });

      const [{ body }] = await findRequests("PUT");
      expect(body).toEqual({ "enable-embedding-sidecar": true });
    });
  });
});
