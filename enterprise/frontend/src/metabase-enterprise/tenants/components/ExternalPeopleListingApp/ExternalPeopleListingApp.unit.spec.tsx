import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPermissionMembershipEndpoint,
  setupTenantEntpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { Tenant, User } from "metabase-types/api";
import {
  createMockTenant,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { ExternalPeopleListingApp } from "./ExternalPeopleListingApp";

const setup = ({
  tenants = [],
  users = [createMockUser()],
  currentUser = createMockUser({
    is_superuser: true,
  }),
}: {
  tenants?: Tenant[];
  users?: User[];
  currentUser?: User;
} = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      tenants: true,
    }),
  });

  setupUsersEndpoints(users);

  setupEnterprisePlugins();
  setupTenantEntpoints(tenants);
  setupPermissionMembershipEndpoint({});

  renderWithProviders(<ExternalPeopleListingApp />, {
    storeInitialState: createMockState({
      settings,
      currentUser,
    }),
  });
};

describe("ExternalPeopleListingApp", () => {
  it("should show tenant association when viewing users", async () => {
    setup({
      users: [createMockUser({ tenant_id: 2 })],
      tenants: [createMockTenant({ id: 2, name: "Testy Tenant" })],
    });

    expect(await screen.findByText("Name")).toBeInTheDocument();
    expect(await screen.findByText("Email")).toBeInTheDocument();
    expect(await screen.findByText("Tenant")).toBeInTheDocument();
    expect(await screen.findByText("Last Login")).toBeInTheDocument();

    expect(await screen.findByText("Testy Tableton")).toBeInTheDocument();
    expect(await screen.findByText("Testy Tenant")).toBeInTheDocument();
  });

  it("should not show a user strategy button", async () => {
    setup();

    expect(
      screen.queryByRole("button", { name: /gear/i }),
    ).not.toBeInTheDocument();
  });

  it("should show an invite button if there are tenants", async () => {
    setup({
      tenants: [createMockTenant({})],
    });

    expect(await screen.findByText("Create tenant user")).toBeInTheDocument();
  });

  it("should not show an invite button if there are no tenants", async () => {
    setup({});

    expect(screen.queryByText("Create tenant user")).not.toBeInTheDocument();
  });

  it("should show a no results special message if there are no tenants", async () => {
    setup({
      users: [],
    });

    expect(
      await screen.findByText("Add your first tenant to add tenant users"),
    ).toBeInTheDocument();
  });

  it("should show a no results special message if there are tenants", async () => {
    setup({
      users: [],
      tenants: [createMockTenant()],
    });

    expect(
      await screen.findByText("Invite tenant users or provision them via SSO"),
    ).toBeInTheDocument();
  });
});
