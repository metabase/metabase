import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupPermissionMembershipEndpoint,
  setupTenantEntpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings, Tenant, User } from "metabase-types/api";
import {
  createMockGroup,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { PeopleListingApp } from "./PeopleListingApp";

interface SetupOpts {
  external?: boolean;
  showInviteButton?: boolean;
  noResultsMessage?: string;
  users?: User[];
  currentUser?: User;
  tenants?: Tenant[];
  useTenants?: boolean;
  settings?: Partial<EnterpriseSettings>;
}

const setup = ({
  external = false,
  showInviteButton = true,
  noResultsMessage = "No results found",
  users = [createMockUser()],
  currentUser = createMockUser({
    is_superuser: true,
  }),
  tenants = [],
  useTenants = true,
  settings: settingOverrides = {},
}: SetupOpts = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      tenants: true,
    }),
    "use-tenants": useTenants,
    ...settingOverrides,
  });

  setupEnterprisePlugins();
  setupTenantEntpoints(tenants);

  setupGroupsEndpoint([
    createMockGroup(),
    createMockGroup({
      name: "Admin",
      id: 2,
      magic_group_type: "admin",
    }),
  ]);

  setupUsersEndpoints(users);

  setupPermissionMembershipEndpoint({});

  renderWithProviders(
    <PeopleListingApp
      external={external}
      showInviteButton={showInviteButton}
      noResultsMessage={noResultsMessage}
    >
      <></>
    </PeopleListingApp>,
    {
      storeInitialState: createMockState({
        settings,
        currentUser,
      }),
    },
  );
};

describe("page title", () => {
  it("should show 'People' when tenants is disabled", async () => {
    setup({ useTenants: false });

    expect(
      await screen.findByRole("heading", { name: "People", level: 1 }),
    ).toBeInTheDocument();
  });

  it("should show 'Internal users' when tenants is enabled and viewing internal users", async () => {
    setup({ useTenants: true, external: false });

    expect(
      await screen.findByRole("heading", { name: "Internal users", level: 1 }),
    ).toBeInTheDocument();
  });

  it("should show 'Tenant users' when tenants is enabled and viewing tenant users", async () => {
    setup({ useTenants: true, external: true });

    expect(
      await screen.findByRole("heading", { name: "Tenant users", level: 1 }),
    ).toBeInTheDocument();
  });
});

describe("people table", () => {
  it("should show group association when viewing internal users", async () => {
    setup();

    expect(await screen.findByText("Name")).toBeInTheDocument();
    expect(await screen.findByText("Email")).toBeInTheDocument();
    expect(await screen.findByText("Groups")).toBeInTheDocument();
    expect(await screen.findByText("Last Login")).toBeInTheDocument();
  });
});

describe("user strategy button", () => {
  it("should appear when viewing internal users page", async () => {
    setup();

    expect(
      await screen.findByRole("button", { name: /gear/i }),
    ).toBeInTheDocument();
  });
});

describe("invite button", () => {
  it("should show when looking at internal users", async () => {
    setup();

    expect(await screen.findByText("Invite someone")).toBeInTheDocument();
  });

  it("should be hidden when the current user is not an admin", () => {
    setup({
      currentUser: createMockUser({
        is_superuser: false,
      }),
    });

    expect(screen.queryByText("Invite someone")).not.toBeInTheDocument();
  });

  it("should hide when showInviteButton is false", () => {
    setup({
      showInviteButton: false,
    });

    expect(screen.queryByText("Invite someone")).not.toBeInTheDocument();
  });
});

describe("no results message", () => {
  it("should show a default message", async () => {
    setup({
      users: [],
    });

    expect(await screen.findByText("No results found")).toBeInTheDocument();
  });

  it("should allow you to show a custom message", async () => {
    const noResultsMessage = "These are not the users you are looking for";
    setup({
      users: [],
      noResultsMessage,
    });

    expect(await screen.findByText(noResultsMessage)).toBeInTheDocument();
  });
});

describe("user menu", () => {
  const ssoUser = createMockUser({
    id: 10,
    email: "sso@example.com",
    sso_source: "saml",
  });

  const openUserMenu = async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: /ellipsis/i }),
    );
    await screen.findByRole("menuitem", { name: "Edit user" });
  };

  it("should offer to reset the password of a password user", async () => {
    setup({ users: [createMockUser({ id: 10, sso_source: null })] });
    await openUserMenu();

    expect(
      screen.getByRole("menuitem", { name: "Reset password" }),
    ).toBeInTheDocument();
  });

  it("should not offer to reset the password of a user whose SSO provider is enabled", async () => {
    setup({ users: [ssoUser], settings: { "saml-enabled": true } });
    await openUserMenu();

    expect(
      screen.queryByRole("menuitem", { name: "Reset password" }),
    ).not.toBeInTheDocument();
  });

  it("should offer to reset the password of an SSO user once their provider is disabled", async () => {
    setup({ users: [ssoUser], settings: { "saml-enabled": false } });
    await openUserMenu();

    expect(
      screen.getByRole("menuitem", { name: "Reset password" }),
    ).toBeInTheDocument();
  });
});
