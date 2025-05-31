import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: Omit<SetupOpts, "hasEnterprisePlugins"> = {}) =>
  baseSetup({
    ...opts,
    hasEnterprisePlugins: false,
  });

describe("EmbeddingSdkOptionCard (OSS)", () => {
  it("should display the correct title and badges", () => {
    setup();

    expect(
      screen.getByText("Embedded analytics SDK for React"),
    ).toBeInTheDocument();
    expect(screen.getByText("Pro and Enterprise")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("should show 'Try it out' button", async () => {
    setup();

    expect(screen.getByText("Try it out")).toBeInTheDocument();
  });

  it("should show legalese modal when the user hasn't agreed to terms yet", async () => {
    setup({
      showSdkEmbedTerms: true,
      isEmbeddingSdkEnabled: false,
    });

    const toggle = screen.getByRole("switch", { name: "Disabled" });
    await userEvent.click(toggle);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("should update enable-embedding-sdk directly when the user has agreed to the terms", async () => {
    const { updateSetting } = setup({
      showSdkEmbedTerms: false,
      isEmbeddingSdkEnabled: false,
    });

    const toggle = screen.getByRole("switch", { name: "Disabled" });
    await userEvent.click(toggle);

    expect(updateSetting).toHaveBeenCalledWith(
      { key: "enable-embedding-sdk" },
      true,
    );
  });

  it("should update enable-embedding-sdk directly when SDK is already enabled", async () => {
    const { updateSetting } = setup({
      showSdkEmbedTerms: true,
      isEmbeddingSdkEnabled: true,
    });

    const toggle = screen.getByRole("switch", { name: "Enabled" });
    await userEvent.click(toggle);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    expect(updateSetting).toHaveBeenCalledWith(
      { key: "enable-embedding-sdk" },
      false,
    );
  });
});
