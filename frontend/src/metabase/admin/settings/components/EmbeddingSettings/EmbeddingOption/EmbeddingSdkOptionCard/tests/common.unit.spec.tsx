import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: Omit<SetupOpts, "hasEnterprisePlugins"> = {}) =>
  baseSetup({
    ...opts,
    hasEnterprisePlugins: false,
  });

describe("EmbeddingSdkOptionCard (OSS)", () => {
  it("should display the correct title and badges", async () => {
    await setup();

    expect(screen.getByText("Embedded Analytics SDK")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("should show 'Try it out' button", async () => {
    await setup();

    expect(screen.getByText("Try it out")).toBeInTheDocument();
  });

  it("should show disabled icon when neither embedding type is enabled", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
    });

    const icon = screen.getByTestId("sdk-icon");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("fill", "none");
  });

  it("should show enabled icon when SDK embedding is enabled", async () => {
    await setup({
      isEmbeddingSdkEnabled: true,
      isEmbeddingSimpleEnabled: false,
    });

    const icon = screen.getByTestId("sdk-icon");
    expect(icon).toBeInTheDocument();
  });

  it("should show enabled icon when simple embedding is enabled", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: true,
    });

    const icon = screen.getByTestId("sdk-icon");
    expect(icon).toBeInTheDocument();
  });

  it("should show enabled icon when both embedding types are enabled", async () => {
    await setup({
      isEmbeddingSdkEnabled: true,
      isEmbeddingSimpleEnabled: true,
    });

    const icon = screen.getByTestId("sdk-icon");
    expect(icon).toBeInTheDocument();
  });
});
