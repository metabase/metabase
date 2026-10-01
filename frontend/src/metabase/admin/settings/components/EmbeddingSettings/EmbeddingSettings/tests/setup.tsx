import { renderWithProviders, screen } from "__support__/ui";

import {
  type SetupOpts as BaseSetupOpts,
  setup as baseSetup,
} from "../../tests/setup";
import { EmbeddingSettings } from "../EmbeddingSettings";

export type SetupOpts = Omit<BaseSetupOpts, "renderCallback">;

export async function setup(setupOptions: SetupOpts = {}) {
  baseSetup({
    enterprisePlugins: [], // ensures PLUGIN_IS_EE_BUILD.isEEBuild is set to true
    ...setupOptions,
    renderCallback: ({ state }) =>
      renderWithProviders(<EmbeddingSettings />, { storeInitialState: state }),
  });

  await screen.findByText("Embedding settings");
}
