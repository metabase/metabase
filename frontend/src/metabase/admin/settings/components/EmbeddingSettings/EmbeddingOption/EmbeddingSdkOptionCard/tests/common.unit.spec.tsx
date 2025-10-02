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

    expect(screen.getByText("Modular embedding")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("should show 'Try it out' button", async () => {
    await setup();

    expect(screen.getByText("Try it out")).toBeInTheDocument();
  });

  it.each([
    {
      description:
        "should disable both icons when both embedding types are disabled",
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
    },
    {
      description: "should enable the react sdk embedding icon when enabled",
      isEmbeddingSdkEnabled: true,
      isEmbeddingSimpleEnabled: false,
    },
    {
      description: "should enable the simple embedding icon when enabled",
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: true,
    },
    {
      description:
        "should enable both icons when both embedding types are enabled",
      isEmbeddingSdkEnabled: true,
      isEmbeddingSimpleEnabled: true,
    },
  ])(
    "$description",
    async ({ isEmbeddingSdkEnabled, isEmbeddingSimpleEnabled }) => {
      await setup({
        isEmbeddingSdkEnabled,
        isEmbeddingSimpleEnabled,
      });

      expect(screen.getByTestId("sdk-icon")).toHaveAttribute(
        "data-disabled",
        String(!isEmbeddingSdkEnabled),
      );

      expect(screen.getByTestId("sdk-js-icon")).toHaveAttribute(
        "data-disabled",
        String(!isEmbeddingSimpleEnabled),
      );
    },
  );
});
