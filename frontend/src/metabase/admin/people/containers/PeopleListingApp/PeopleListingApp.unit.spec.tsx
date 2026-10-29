import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  findRequests,
  setupGroupsEndpoint,
  setupPermissionMembershipEndpoint,
  setupTenantEntpoints,
  setupUserCollectionEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { delay } from "__support__/utils";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
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

  setupUserCollectionEndpoints(users);

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

  it("should not offer to reset a password when password login is disabled (metabase#23630)", async () => {
    setup({
      users: [createMockUser({ id: 10, sso_source: null })],
      settings: { "enable-password-login": false },
    });
    await openUserMenu();

    expect(
      screen.queryByRole("menuitem", { name: "Reset password" }),
    ).not.toBeInTheDocument();
  });
});

const createTestUsers = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    createMockUser({
      id: index + 1,
      first_name: `Firstname${index}`,
      last_name: `Lastname${index}`,
      email: `user${index}@metabase.test`,
    }),
  );

const NO_COLLECTION = createMockUser({
  id: 1,
  first_name: "No Collection",
  last_name: "Tableton",
  email: "nocollection@metabase.test",
});
const NORMAL = createMockUser({
  id: 2,
  first_name: "Normal",
  last_name: "Tableton",
  email: "normal@metabase.test",
});
const BOBBY = createMockUser({
  id: 3,
  first_name: "Bobby",
  last_name: "Tables",
  email: "bobby@metabase.test",
});

const getUserRows = async () => {
  const table = await screen.findByTestId("admin-people-list-table");
  // The only row outside the body is the column header.
  return within(table).getAllByRole("row").slice(1);
};

const getUserQueries = async () =>
  (await findRequests("GET"))
    .map(({ url }) => new URL(url))
    .filter((url) => url.pathname === "/api/user")
    .map((url) => url.searchParams.get("query"));

describe("people list", () => {
  it("should list every user and say how many were found", async () => {
    setup({ users: createTestUsers(3) });

    expect(await getUserRows()).toHaveLength(3);
    expect(screen.getByText("3 people found")).toBeInTheDocument();
  });

  it("should count a single result in the singular", async () => {
    setup({ users: createTestUsers(1) });

    expect(await screen.findByText("1 person found")).toBeInTheDocument();
  });
});

describe("search", () => {
  it("should ask the backend for the typed query and list what came back", async () => {
    setup({ users: [NO_COLLECTION, NORMAL, BOBBY] });
    expect(await screen.findByText("3 people found")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Find someone"), "no");
    expect(await screen.findByText("2 people found")).toBeInTheDocument();
    expect(await getUserRows()).toHaveLength(2);

    await userEvent.type(screen.getByPlaceholderText("Find someone"), "rm");
    expect(await screen.findByText("1 person found")).toBeInTheDocument();
    expect(screen.getByText("Normal Tableton")).toBeInTheDocument();
    expect(screen.queryByText("Bobby Tables")).not.toBeInTheDocument();

    await waitFor(async () => expect(await getUserQueries()).toContain("norm"));
  });

  it("should restore the full list when the search is cleared", async () => {
    setup({ users: [NO_COLLECTION, NORMAL, BOBBY] });
    expect(await screen.findByText("3 people found")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Find someone"), "norm");
    expect(await screen.findByText("1 person found")).toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText("Find someone"));

    expect(await screen.findByText("3 people found")).toBeInTheDocument();
  });

  it("should not search on a single character", async () => {
    setup({ users: [NO_COLLECTION, NORMAL, BOBBY] });
    expect(await screen.findByText("3 people found")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Find someone"), "n");

    await delay(SEARCH_DEBOUNCE_DURATION * 2);
    expect(screen.getByText("3 people found")).toBeInTheDocument();
    expect(await getUserQueries()).not.toContain("n");
  });
});

describe("pagination", () => {
  const PAGE_SIZE = 25;
  const TOTAL_USERS = PAGE_SIZE + 1;

  const getPreviousPageButton = () =>
    screen.getByRole("button", { name: "Previous page" });
  const getNextPageButton = () =>
    screen.getByRole("button", { name: "Next page" });

  it("should page people forward and backward", async () => {
    setup({ users: createTestUsers(TOTAL_USERS) });

    expect(await getUserRows()).toHaveLength(PAGE_SIZE);
    expect(screen.getByText(`${TOTAL_USERS} people found`)).toBeInTheDocument();
    expect(screen.getByText(`1 - ${PAGE_SIZE}`)).toBeInTheDocument();
    expect(getPreviousPageButton()).toBeDisabled();

    await userEvent.click(getNextPageButton());

    expect(
      await screen.findByText(`${PAGE_SIZE + 1} - ${TOTAL_USERS}`),
    ).toBeInTheDocument();
    expect(await getUserRows()).toHaveLength(TOTAL_USERS - PAGE_SIZE);
    expect(getNextPageButton()).toBeDisabled();

    await userEvent.click(getPreviousPageButton());

    expect(await screen.findByText(`1 - ${PAGE_SIZE}`)).toBeInTheDocument();
    expect(await getUserRows()).toHaveLength(PAGE_SIZE);
  });
});

describe("deactivated users", () => {
  const ACTIVE_USER = createMockUser({
    id: 1,
    first_name: "Active",
    last_name: "Person",
    email: "active@metabase.test",
  });
  const DEACTIVATED_USER = createMockUser({
    id: 2,
    first_name: "Gone",
    last_name: "Person",
    email: "gone@metabase.test",
    is_active: false,
  });

  it("should offer the Deactivated tab only when somebody is deactivated", async () => {
    setup({ users: [ACTIVE_USER, DEACTIVATED_USER] });

    expect(
      await screen.findByRole("tab", { name: "Deactivated" }),
    ).toBeInTheDocument();
  });

  it("should hide the tabs when nobody is deactivated", async () => {
    setup({ users: [ACTIVE_USER] });
    await screen.findByText("Active Person");

    expect(
      screen.queryByRole("tab", { name: "Deactivated" }),
    ).not.toBeInTheDocument();
  });

  it("should list the deactivated users with a way to reactivate them", async () => {
    setup({ users: [ACTIVE_USER, DEACTIVATED_USER] });

    await userEvent.click(
      await screen.findByRole("tab", { name: "Deactivated" }),
    );

    expect(await screen.findByText("Gone Person")).toBeInTheDocument();
    expect(screen.queryByText("Active Person")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /refresh icon/i })).toHaveAttribute(
      "href",
      "/admin/people/2/reactivate",
    );
  });

  it("should hide the tabs from a non-admin", async () => {
    setup({
      users: [ACTIVE_USER, DEACTIVATED_USER],
      currentUser: createMockUser({ id: 1, is_superuser: false }),
    });
    await screen.findByText("Active Person");

    expect(
      screen.queryByRole("tab", { name: "Deactivated" }),
    ).not.toBeInTheDocument();
  });
});

describe("deactivating users", () => {
  const ADMIN = createMockUser({
    id: 1,
    first_name: "Bobby",
    last_name: "Tables",
    email: "admin@metabase.test",
    is_superuser: true,
  });
  const OTHER_ADMIN = createMockUser({
    id: 2,
    first_name: "Other",
    last_name: "Admin",
    email: "other@metabase.test",
    is_superuser: true,
  });

  const openRowMenu = async (fullName: string) => {
    const row = (await getUserRows()).find((candidate) =>
      within(candidate).queryByText(fullName),
    );
    if (!row) {
      throw new Error(`No row for ${fullName}`);
    }
    await userEvent.click(
      within(row).getByRole("button", { name: /ellipsis/i }),
    );
    await screen.findByRole("menuitem", { name: "Edit user" });
  };

  it("should not offer an admin a way to deactivate themselves", async () => {
    setup({ users: [ADMIN, OTHER_ADMIN], currentUser: ADMIN });

    await openRowMenu("Bobby Tables");

    expect(
      screen.getByRole("menuitem", { name: "Edit user" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Reset password" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Deactivate user" }),
    ).not.toBeInTheDocument();
  });

  it("should offer to deactivate another admin", async () => {
    setup({ users: [ADMIN, OTHER_ADMIN], currentUser: ADMIN });

    await openRowMenu("Other Admin");

    expect(
      screen.getByRole("menuitem", { name: "Deactivate user" }),
    ).toHaveAttribute("href", "/admin/people/2/deactivate");
  });
});
