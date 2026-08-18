import { screen, within } from "__support__/ui";

import { type SetupProps, setup as baseSetup } from "./setup";

function setup(opts?: SetupProps) {
  baseSetup({
    tokenFeatures: { whitelabel: true },
    enterprisePlugins: ["whitelabel"],
    ...opts,
  });
}

describe("Onboarding (EE with token)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("footer", () => {
    it("should not render the 'learning' section is `showMetabaseLinks` has been turned off in whitelabeling", () => {
      setup({ showMetabaseLinks: false });

      const footer = screen.getByRole("contentinfo");
      const learning = within(footer).queryByTestId("learning-section");
      expect(learning).not.toBeInTheDocument();
    });

    it("should render the premium 'help' section for admins of instances on paid plans", () => {
      setup({ isAdmin: true });

      const footer = screen.getByRole("contentinfo");
      const helpSection = within(footer).getByTestId("help-section");

      expect(helpSection).toBeInTheDocument();
      expect(
        within(helpSection).getByRole("link", { name: "Get Help" }),
      ).toHaveAttribute(
        "href",
        "https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v1",
      );
    });

    it("should not render the premium 'help' section for non-admins even if the instance is on a paid plan", () => {
      setup({ isAdmin: false });

      const footer = screen.getByRole("contentinfo");
      const helpSection = within(footer).getByTestId("help-section");

      expect(helpSection).toBeInTheDocument();
      expect(
        within(helpSection).getByRole("link", { name: "Get Help" }),
      ).toHaveAttribute(
        "href",
        "https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v1",
      );
    });
  });
});
