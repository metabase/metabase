import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_EMBEDDING } from "metabase/plugins";

import { EmbeddingIframeSdkOptionCard } from "../EmbeddingIframeSdkOptionCard";

import { setup as baseSetup } from "./setup";

const setup = () => {
  const { state } = baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { embedding_iframe_sdk: true },
  });

  jest.spyOn(PLUGIN_EMBEDDING, "isEnabled").mockReturnValue(true);

  renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
    storeInitialState: state,
  });
};

describe("EmbeddingIframeSdkOptionCard (EE with token)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows 'Configure' button for EE instances", () => {
    setup();

    expect(
      screen.getByRole("button", { name: "Configure" }),
    ).toBeInTheDocument();
  });
});
