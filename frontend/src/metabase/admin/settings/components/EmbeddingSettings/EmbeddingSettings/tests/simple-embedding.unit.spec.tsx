import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts = {}) =>
  baseSetup({
    tokenFeatures: {
      embedding_sdk: true,
      embedding_simple: true,
    },
    enterprisePlugins: ["embedding"],
    ...opts,
  });

describe("EmbeddingSdkSettings (EE with Simple Embedding feature)", () => {
  it("should show both SDK and Simple Embedding toggles", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
    });

    const toggles = screen.getAllByRole("switch");
    expect(toggles).toHaveLength(2);

    expect(
      screen.getByRole("switch", {
        name: "Enable modular embedding SDK toggle",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("switch", {
        name: "Enable modular embedding toggle",
      }),
    ).toBeInTheDocument();
  });

  it("should show legalese modal when Simple Embedding toggle is enabled", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Enable Embedded Analytics JS
    const toggle = await screen.findByRole("switch", {
      name: "Enable modular embedding toggle",
    });

    await userEvent.click(toggle);

    // Should show the legalese modal
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("First, some legalese")).toBeInTheDocument();
    expect(screen.getByText("Decline and go back")).toBeInTheDocument();
    expect(screen.getByText("Agree and continue")).toBeInTheDocument();
  });

  it("should update simple embedding settings when user accepts terms", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
    });

    const toggle = await screen.findByRole("switch", {
      name: "Enable modular embedding toggle",
    });

    await userEvent.click(toggle);
    await userEvent.click(screen.getByText("Agree and continue"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);

    const [{ body }] = puts;
    expect(body).toEqual({
      "enable-embedding-simple": true,
      "show-simple-embed-terms": false,
    });
  });

  it("should show embed button and docs when simple embedding is available", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: true,
      showSdkEmbedTerms: false,
    });

    const card = screen
      .getAllByTestId("sdk-setting-card")
      .find((card) => card.textContent?.includes("Enable modular embedding"));

    expect(card).toHaveTextContent("New embed");
    expect(card).toHaveTextContent("Documentation");
  });
});
