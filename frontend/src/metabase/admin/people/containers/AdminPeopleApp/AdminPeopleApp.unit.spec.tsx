import { IndexRoute, Route } from "react-router";

import { renderWithProviders, screen, within } from "__support__/ui";
import { UpsellTenants } from "metabase/admin/upsells/UpsellTenants";
import { createTenantsRouteGuard } from "metabase/admin/utils";
import {
  createMockAdminAppState,
  createMockAdminState,
  createMockLocation,
  createMockRoutingState,
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { EmbeddingHomepageStatus } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AdminPeopleApp } from "./AdminPeopleApp";

interface SetupOpts {
  activeUsersCount?: number;
  ssoEnabled?: boolean;
  isSuperUser?: boolean;
  useTenants?: boolean;
  setupEmbeddingAutoenabled?: boolean;
  embeddingHomepage?: "hidden" | "visible" | "dismissed";
  hasTenantsFeature?: boolean;
}

const setup = async (inputSetupOpts?: Partial<SetupOpts>) => {
  const defaultSetupOpts: SetupOpts = {
    activeUsersCount: 50,
    ssoEnabled: false,
    isSuperUser: true,
    useTenants: false,
    setupEmbeddingAutoenabled: false,
    embeddingHomepage: "hidden",
    hasTenantsFeature: false,
  };
  const setupOpts = Object.assign(defaultSetupOpts, inputSetupOpts ?? {});

  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: setupOpts.isSuperUser,
    }),
    settings: createMockSettingsState({
      "active-users-count": setupOpts.activeUsersCount,
      "embedding-homepage":
        setupOpts.embeddingHomepage as EmbeddingHomepageStatus,
      "setup-embedding-autoenabled": setupOpts.setupEmbeddingAutoenabled,
      "use-tenants": setupOpts.useTenants,
      "token-features": createMockTokenFeatures({
        sso_saml: setupOpts.ssoEnabled,
        tenants: setupOpts.hasTenantsFeature,
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

const setupTenantRoute = async (initialRoute: string) => {
  const state = createMockState({
    admin: createMockAdminState({
      app: createMockAdminAppState({
        paths: [{ key: "people", name: "People", path: "/admin/people" }],
      }),
    }),
    currentUser: createMockUser({
      is_superuser: true,
    }),
    routing: createMockRoutingState({
      locationBeforeTransitions: createMockLocation({
        pathname: initialRoute,
      }),
    }),
    settings: createMockSettingsState({
      "setup-embedding-autoenabled": true,
      "use-tenants": false,
      "token-features": createMockTokenFeatures({
        tenants: false,
      }),
    }),
  });

  renderWithProviders(
    <Route path="/admin/people" component={AdminPeopleApp}>
      <Route path="tenants" component={createTenantsRouteGuard()}>
        <Route path="groups" component={UpsellTenants} />
        <Route path="people" component={UpsellTenants} />
        <IndexRoute component={UpsellTenants} />
      </Route>
    </Route>,
    {
      initialRoute,
      storeInitialState: state,
      withRouter: true,
    },
  );
};

describe("AdminPeopleApp", () => {
  describe("sidebar", () => {
    it("should render only internal people and groups links if tenants is disabled", async () => {
      await setup();

      await assertNavLink("People", "/admin/people");
      await assertNavLink("Groups", "/admin/people/groups");
      expect(screen.queryByText("Tenants")).not.toBeInTheDocument();
      expect(screen.queryByText("Tenant users")).not.toBeInTheDocument();
    });

    it("should render both internal and external people links if tenants is enabled", async () => {
      await setup({ useTenants: true });

      await assertNavLink("Internal users", "/admin/people");
      await assertNavLink("Internal groups", "/admin/people/groups");
      await assertNavLink("Tenants", "/admin/people/tenants");
      await assertNavLink("Tenant users", "/admin/people/tenants/people");
    });

    it("should render a tenant upsell link for embedding setup instances without tenants", async () => {
      await setup({ setupEmbeddingAutoenabled: true });

      const tenantsLink = await assertNavLink(
        "Tenants",
        "/admin/people/tenants",
      );

      expect(within(tenantsLink).getByTestId("upsell-gem")).toBeInTheDocument();
    });

    it("should render tenant upsell links when only the legacy embedding homepage signal is present", async () => {
      await setup({ embeddingHomepage: "visible" });

      const tenantsLink = await assertNavLink(
        "Tenants",
        "/admin/people/tenants",
      );

      expect(within(tenantsLink).getByTestId("upsell-gem")).toBeInTheDocument();
    });
  });

  describe("tenant upsell routes", () => {
    it("should render the tenant upsell on /admin/people/tenants", async () => {
      await setupTenantRoute("/admin/people/tenants");

      expect(
        await screen.findByText("Manage customer-facing analytics at scale"),
      ).toBeInTheDocument();
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
  const linkLabel = await screen.findByText(linkText);
  const link =
    linkLabel.closest("a") ?? document.querySelector(`a[href="${linkHref}"]`);

  expect(link).toBeInTheDocument();
  expect(link).toHaveAttribute("href", linkHref);

  return link as HTMLElement;
}
