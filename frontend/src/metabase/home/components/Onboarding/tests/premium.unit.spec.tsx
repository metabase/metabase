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

  describe("documentation links", () => {
    it("should not render for 'sql' item", () => {
      setup({ openItem: "sql", showMetabaseLinks: false });

      const alertItem = screen.getByTestId("sql-item");
      const sqlCopy = within(alertItem).getByText(/SQL templates/);

      expect(sqlCopy).not.toHaveAttribute("href");
    });

    it("should not render for 'dashboard' item", () => {
      setup({ openItem: "dashboard", showMetabaseLinks: false });

      const alertItem = screen.getByTestId("dashboard-item");
      const dashboardCopy = within(alertItem).getByText(/dashboard with tabs/);

      expect(dashboardCopy).not.toHaveAttribute("href");
    });

    it("should not render for 'alert' item", () => {
      setup({ openItem: "alert", showMetabaseLinks: false });

      const alertItem = screen.getByTestId("alert-item");

      const goalCopy = within(alertItem).getByText(/Goal line alerts/);
      const progressCopy = within(alertItem).getByText(/Progress bar alerts/);
      const resultCopy = within(alertItem).getByText(/Results alerts/);

      [goalCopy, progressCopy, resultCopy].forEach(copy => {
        expect(copy).not.toHaveAttribute("href");
      });
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
