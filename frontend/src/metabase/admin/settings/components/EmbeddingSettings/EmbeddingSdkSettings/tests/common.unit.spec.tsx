import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { screen, within } from "__support__/ui";

import { setup } from "./setup";

describe("EmbeddingSdkSettings (OSS)", () => {
  describe("banner text when user is self-hosted or cloud", () => {
    it("should tell users to use localhost and API keys to test the SDK", async () => {
      await setup({
        isEmbeddingSdkEnabled: true,
        showSdkEmbedTerms: false,
      });
      expect(
        screen.getByText(
          /You can test Embedded analytics SDK on localhost quickly by using API keys/i,
        ),
      ).toBeInTheDocument();

      const alertInfo = within(screen.getByTestId("sdk-settings-alert-info"));
      expect(
        alertInfo.getByText("switch Metabase binaries"),
      ).toBeInTheDocument();
      expect(
        alertInfo.getByText("upgrade to Metabase Pro"),
      ).toBeInTheDocument();
      expect(
        alertInfo.getByText("implement JWT or SAML SSO"),
      ).toBeInTheDocument();
    });
  });

  describe("Modal behavior based on enable-embedding-sdk and show-sdk-embed-terms", () => {
    describe("when enable-embedding-sdk=false & show-sdk-embed-terms=true", () => {
      it("should update settings when user accepts the SDK terms", async () => {
        await setup({
          isEmbeddingSdkEnabled: false,
          showSdkEmbedTerms: true,
        });

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(
          screen.getByRole("switch", { name: "SDK for React toggle" }),
        );
        assertLegaleseModal();

        await userEvent.click(screen.getByText("Agree and continue"));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        const puts = await findRequests("PUT");
        expect(puts).toHaveLength(1);
        const [{ body }] = puts;
        expect(body).toEqual({
          "enable-embedding-sdk": true,
          "show-sdk-embed-terms": false,
        });
      });

      it("should not update settings when user declines the SDK terms", async () => {
        await setup({
          isEmbeddingSdkEnabled: false,
          showSdkEmbedTerms: true,
        });

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(
          screen.getByRole("switch", { name: "SDK for React toggle" }),
        );
        assertLegaleseModal();

        await userEvent.click(screen.getByText("Decline and go back"));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        const puts = await findRequests("PUT");
        expect(puts).toHaveLength(0);
      });
    });

    describe("when enable-embedding-sdk=false & show-sdk-embed-terms=false", () => {
      it("should not show the modal when the user clicks the toggle", async () => {
        await setup({
          isEmbeddingSdkEnabled: false,
          showSdkEmbedTerms: false,
        });

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(
          screen.getByRole("switch", { name: "SDK for React toggle" }),
        );
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        const puts = await findRequests("PUT");
        expect(puts).toHaveLength(1);
        const [{ url, body }] = puts;
        expect(url).toContain("api/setting/enable-embedding-sdk");
        expect(body).toEqual({
          value: true,
        });
      });
    });
  });

  it("should not show version pinning section", async () => {
    await setup({
      isEmbeddingSdkEnabled: true,
      showSdkEmbedTerms: false,
    });
    expect(screen.queryByText("Version pinning")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Metabase Cloud instances are automatically upgraded to new releases. SDK packages are strictly compatible with specific version of Metabase. You can request to pin your Metabase to a major version and upgrade your Metabase and SDK dependency in a coordinated fashion.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Request version pinning" }),
    ).not.toBeInTheDocument();
  });

  it("should show cards with related settings", async () => {
    await setup({
      isEmbeddingSdkEnabled: true,
      showSdkEmbedTerms: false,
    });

    const relatedSettingCards = await screen.findAllByTestId(
      "related-setting-card",
    );
    expect(relatedSettingCards).toHaveLength(5);

    expect(await screen.findByText("Authentication")).toBeInTheDocument();
    expect(await screen.findByText("Databases")).toBeInTheDocument();
    expect(await screen.findByText("People")).toBeInTheDocument();
    expect(await screen.findByText("Permissions")).toBeInTheDocument();
    expect(await screen.findByText("Appearance")).toBeInTheDocument();
  });

  it("shows the Embedded Analytics JS toggle is Disabled when token features are missing (EMB-801)", () => {
    setup({ tokenFeatures: { embedding_simple: false } });

    const toggle = screen.getByRole("switch", {
      name: "Embedded Analytics JS toggle",
    });

    expect(toggle).toBeDisabled();

    const toggleContainer = screen
      .getAllByTestId("switch-with-env-var")
      .find((toggleElement) =>
        within(toggleElement).queryByRole("switch", {
          name: "Embedded Analytics JS toggle",
        }),
      );

    expect(within(toggleContainer!).getByText("Disabled")).toBeInTheDocument();
  });
});

function assertLegaleseModal() {
  expect(screen.getByRole("dialog")).toBeInTheDocument();

  expect(screen.getByText("First, some legalese")).toBeInTheDocument();
  expect(screen.getByText("Decline and go back")).toBeInTheDocument();
  expect(screen.getByText("Agree and continue")).toBeInTheDocument();
}
