import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { AdminPeopleApp } from "./AdminPeopleApp";

interface SetupOpts {
  activeUsersCount?: number;
  ssoEnabled?: boolean;
  isSuperUser?: boolean;
  useTenants?: boolean;
}

const setup = async (inputSetupOpts?: Partial<SetupOpts>) => {
  const defaultSetupOpts: SetupOpts = {
    activeUsersCount: 50,
    ssoEnabled: false,
    isSuperUser: true,
    useTenants: false,
  };
  const setupOpts = Object.assign(defaultSetupOpts, inputSetupOpts ?? {});

  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: setupOpts.isSuperUser,
    }),
    settings: createMockSettingsState({
      "active-users-count": setupOpts.activeUsersCount,
      "use-tenants": setupOpts.useTenants,
      "token-features": createMockTokenFeatures({
        sso_saml: setupOpts.ssoEnabled,
      }),
    }),
  });

  renderWithProviders(
    <Route path="/" component={() => <AdminPeopleApp>empty</AdminPeopleApp>} />,
    {
      storeInitialState: state,
      withRouter: true,
    },
  );
};

describe("AdminPeopleApp", () => {
  describe("sidebar", () => {
    it("should render only internal people and groups links if tenants is disabled", async () => {
      await setup();

      assertNavLink("People", "/admin/people");
      assertNavLink("Groups", "/admin/people/groups");
      expect(screen.queryByText("Tenants")).not.toBeInTheDocument();
      expect(screen.queryByText("Tenant users")).not.toBeInTheDocument();
    });

    it("should render both internal and external people links if tenants is enabled", async () => {
      await setup({ useTenants: true });

      assertNavLink("Internal users", "/admin/people");
      assertNavLink("Internal groups", "/admin/people/groups");
      assertNavLink("Tenants", "/admin/people/tenants");
      assertNavLink("Tenant users", "/admin/people/tenants/people");
    });
  });

  describe("nudge to pro", () => {
    const nudgeText = /tired of manually managing people/i;

    it("should be visible when user is admin, has 50 active users, and SSO is not available", () => {
      setup();
      expect(screen.getByText(nudgeText)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /try metabase pro/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute(
        "href",
        expect.stringMatching(/^https:\/\/www.metabase.com\/upgrade/),
      );
    });

    it("should not be visible with less than 50 users", () => {
      setup({ activeUsersCount: 10 });
      expect(screen.queryByText(nudgeText)).not.toBeInTheDocument();
    });

    it("should not be visible when user is not admin", () => {
      setup({ isSuperUser: false });
      expect(screen.queryByText(nudgeText)).not.toBeInTheDocument();
    });

    it("should not be visible when SSO is already available", () => {
      setup({ ssoEnabled: true });
      expect(screen.queryByText(nudgeText)).not.toBeInTheDocument();
    });
  });
});

async function assertNavLink(linkText: string, linkHref: string) {
  const link = await screen.findByText(linkText);
  expect(link).toBeInTheDocument();
  expect(link).toHaveAttribute("href", linkHref);
}
