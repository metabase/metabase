import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts = {}) =>
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: {
      embedding_sdk: true,
      embedding_iframe_sdk: true,
    },
    ...opts,
  });

describe("EmbeddingSdkSettings (EE with Simple Embedding feature)", () => {
  it("should show both SDK and Simple Embedding toggles", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
      showSimpleEmbedTerms: false,
    });

    // Check that both toggles are present
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);

    // Check for the labels
    expect(screen.getByText("SDK Embedding")).toBeInTheDocument();
    expect(screen.getByText("Simple Embedding")).toBeInTheDocument();

    // Check for the Beta badge
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("should show 'Authorized Origins' instead of 'Cross-Origin Resource Sharing (CORS)'", async () => {
    await setup({
      isEmbeddingSdkEnabled: true,
      showSdkEmbedTerms: false,
    });

    expect(screen.getByText("Authorized Origins")).toBeInTheDocument();
    expect(
      screen.queryByText("Cross-Origin Resource Sharing (CORS)"),
    ).not.toBeInTheDocument();
  });

  it("should enable CORS field when either SDK or Simple Embedding is enabled", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: true,
      showSdkEmbedTerms: false,
      showSimpleEmbedTerms: false,
    });

    const input = screen.getByDisplayValue("");
    expect(input).toBeEnabled();
  });

  it("should show legalese modal when Simple Embedding toggle is enabled", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
      showSimpleEmbedTerms: true,
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Click on the Simple Embedding toggle (second switch)
    const switches = screen.getAllByRole("switch");
    await userEvent.click(switches[1]);

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
      showSimpleEmbedTerms: true,
    });

    // Click on the Simple Embedding toggle (second switch)
    const switches = screen.getAllByRole("switch");
    await userEvent.click(switches[1]);

    // Accept the terms
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
});
