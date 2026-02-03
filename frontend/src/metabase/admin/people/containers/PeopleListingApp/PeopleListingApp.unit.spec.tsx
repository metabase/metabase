import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupPermissionMembershipEndpoint,
  setupTenantEntpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { Tenant, User } from "metabase-types/api";
import {
  createMockGroup,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PeopleListingApp } from "./PeopleListingApp";

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
}: {
  external?: boolean;
  showInviteButton?: boolean;
  noResultsMessage?: string;
  users?: User[];
  currentUser?: User;
  tenants?: Tenant[];
  useTenants?: boolean;
} = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      tenants: true,
    }),
    "use-tenants": useTenants,
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
