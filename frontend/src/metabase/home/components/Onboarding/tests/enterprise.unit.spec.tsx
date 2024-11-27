import { screen, within } from "@testing-library/react";

import { type SetupProps, setup as baseSetup } from "./setup";

function setup(opts?: SetupProps) {
  baseSetup({
    hasEnterprisePlugins: true,
    ...opts,
  });
}

describe("Onboarding (EE without token)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("'Set up your Metabase' section", () => {
    it("'invite people' should show the default copy without the activated token", () => {
      setup({ openItem: "invite" });

      const inviteItem = screen.getByTestId("invite-item");

      expect(
        within(inviteItem).getByText(
          "Don't be shy with invites. Metabase makes self-service analytics easy.",
        ),
      ).toBeInTheDocument();
      expect(
        within(inviteItem).queryByText(
          "Don't be shy with invites. Metabase Starter plan includes 5 users, and Pro includes 10 users without the need to pay additionally.",
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe("footer", () => {
    it("should render the 'learning' section", () => {
      setup();

      const footer = screen.getByRole("contentinfo");
      const learning = within(footer).getByTestId("learning-section");

      expect(
        within(learning).getByRole("heading", {
          name: "Get the most out of Metabase",
        }),
      ).toBeInTheDocument();
      expect(
        within(learning).getByText(
          /data visualization, modeling, and other data/,
        ),
      ).toBeInTheDocument();
      expect(
        within(learning).getByRole("link", {
          name: "Docs",
        }),
      ).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/?utm_source=product&utm_medium=docs&utm_campaign=help&utm_content=getting-started&source_plan=oss",
      );
    });

    it("should not render the 'help' section", () => {
      setup();

      const footer = screen.getByRole("contentinfo");
      expect(
        within(footer).queryByTestId("help-section"),
      ).not.toBeInTheDocument();
    });
  });
});
