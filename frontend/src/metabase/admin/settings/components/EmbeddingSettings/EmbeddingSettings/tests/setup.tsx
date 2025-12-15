import { renderWithProviders, screen } from "__support__/ui";

import {
  type SetupOpts as BaseSetupOpts,
  setup as baseSetup,
} from "../../tests/setup";
import { EmbeddingSettings } from "../EmbeddingSettings";

export type SetupOpts = Omit<BaseSetupOpts, "renderCallback">;

export async function setup(setupOptions: SetupOpts = {}) {
  baseSetup({
    ...setupOptions,
    renderCallback: ({ state }) =>
      renderWithProviders(<EmbeddingSettings />, { storeInitialState: state }),
  });

  await screen.findByText("Embedding settings");
}
