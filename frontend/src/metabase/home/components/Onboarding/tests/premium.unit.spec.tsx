import { screen, within } from "@testing-library/react";

import { type SetupProps, setup as baseSetup } from "./setup";

function setup(opts?: SetupProps) {
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { whitelabel: true },
    ...opts,
  });
}

describe("Onboarding (EE with token)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("'Set up your Metabase' section", () => {
    it("'invite people' should have a tailored copy for the starter and pro plans", () => {
      setup({ openItem: "invite" });

      const inviteItem = screen.getByTestId("invite-item");

      expect(
        within(inviteItem).queryByText(
          "Don't be shy with invites. Metabase makes self-service analytics easy.",
        ),
      ).not.toBeInTheDocument();

      expect(
        within(inviteItem).getByText(
          "Don't be shy with invites. Metabase Starter plan includes 5 users, and Pro includes 10 users without the need to pay additionally.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("footer", () => {
    it("should not render the 'learning' section is `showMetabaseLinks` has been turned off in whitelabeling", () => {
      setup({ showMetabaseLinks: false });

      const footer = screen.getByRole("contentinfo");
      const learning = within(footer).queryByTestId("learning-section");
      expect(learning).not.toBeInTheDocument();
    });

    it("should render the 'help' section for paid plans", () => {
      setup();

      const footer = screen.getByRole("contentinfo");
      const helpSection = within(footer).getByTestId("help-section");

      expect(helpSection).toBeInTheDocument();
      expect(within(helpSection).getByRole("link")).toHaveAttribute(
        "href",
        "mailto:help@metabase.com",
      );
      expect(
        within(helpSection).getByRole("button", { name: "Get Help" }),
      ).toBeInTheDocument();
    });
  });
});
