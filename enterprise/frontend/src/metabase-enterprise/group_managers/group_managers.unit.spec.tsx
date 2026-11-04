import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequests,
  setupApiKeyEndpoints,
  setupGroupEndpoint,
  setupGroupMutationEndpoints,
  setupGroupsEndpoint,
  setupMembershipMutationEndpoints,
  setupPermissionMembershipEndpoint,
  setupUserCollectionEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  createMockAdminAppState,
  createMockAdminState,
  createMockState,
} from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { GroupDetailApp } from "metabase/admin/people/containers/GroupDetailApp";
import { GroupsListingApp } from "metabase/admin/people/containers/GroupsListingApp";
import { PeopleListingApp } from "metabase/admin/people/containers/PeopleListingApp";
import type { AdminPath } from "metabase/redux/store";
import { Route } from "metabase/router";
import type { Group, Member, Membership } from "metabase-types/api";
import {
  createMockGroup,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const COLLECTION_GROUP_ID = 10;
const DATA_GROUP_ID = 11;

const MANAGER = createMockUser({
  id: 2,
  first_name: "Normal",
  last_name: "Tableton",
  email: "normal@metabase.test",
  is_superuser: false,
  permissions: { is_group_manager: true },
});

const managerMembership = (
  groupId: number,
  membershipId: number,
): Membership => ({
  user_id: MANAGER.id,
  group_id: groupId,
  membership_id: membershipId,
  is_group_manager: true,
});

const managerMember = (groupId: number, membershipId: number): Member => ({
  user_id: MANAGER.id,
  group_id: groupId,
  membership_id: membershipId,
  email: MANAGER.email,
  first_name: "Normal",
  last_name: "Tableton",
  is_group_manager: true,
  is_superuser: false,
});

const COLLECTION_GROUP: Group = {
  ...createMockGroup({
    id: COLLECTION_GROUP_ID,
    name: "collection",
    magic_group_type: null,
  }),
  members: [managerMember(COLLECTION_GROUP_ID, 100)],
};

const DATA_GROUP: Group = {
  ...createMockGroup({
    id: DATA_GROUP_ID,
    name: "data",
    magic_group_type: null,
  }),
  members: [managerMember(DATA_GROUP_ID, 101)],
};

const PEOPLE_ONLY_PATHS: AdminPath[] = [
  { key: "people", getName: () => "People", path: "/admin/people" },
];

interface SetupOpts {
  initialRoute: string;
  groups: Group[];
  memberships: Membership[];
  adminPaths?: AdminPath[];
}

const setup = ({
  initialRoute,
  groups,
  memberships,
  adminPaths = PEOPLE_ONLY_PATHS,
}: SetupOpts) => {
  // The plugin reads the token features as it initializes, so the settings have
  // to be in place first.
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: true,
    }),
  });
  setupEnterpriseOnlyPlugin("group_managers");
  setupUserCollectionEndpoints([MANAGER]);
  setupApiKeyEndpoints([]);
  setupGroupsEndpoint(groups.map(({ members, ...group }) => group));
  groups.forEach(setupGroupEndpoint);
  setupGroupMutationEndpoints();
  setupPermissionMembershipEndpoint({ [MANAGER.id]: memberships });
  setupMembershipMutationEndpoints();

  return renderWithProviders(
    <Route path="/admin/people">
      <Route index element={<PeopleListingApp />} />
      <Route path="groups">
        <Route index element={<GroupsListingApp />} />
        <Route path=":groupId" element={<GroupDetailApp />} />
      </Route>
    </Route>,
    {
      initialRoute,
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: MANAGER,
        admin: createMockAdminState({
          app: createMockAdminAppState({ paths: adminPaths }),
        }),
        settings,
      }),
    },
  );
};

const confirmLosingManagement = async () => {
  expect(
    await screen.findByText(
      "You will not be able to manage users of this group anymore.",
    ),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
};

describe("group managers on a group's page", () => {
  it("should warn before a manager demotes themselves and send them back to the groups list", async () => {
    const { router } = setup({
      initialRoute: `/admin/people/groups/${COLLECTION_GROUP_ID}`,
      groups: [COLLECTION_GROUP, DATA_GROUP],
      memberships: [
        managerMembership(COLLECTION_GROUP_ID, 100),
        managerMembership(DATA_GROUP_ID, 101),
      ],
    });

    expect(await screen.findByText("Manager")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Turn into Member" }),
    );

    await confirmLosingManagement();

    await waitFor(async () =>
      expect(await findRequests("PUT")).toHaveLength(1),
    );
    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/permissions/membership/100");
    expect(body).toMatchObject({ is_group_manager: false });

    await waitFor(() =>
      expect(router?.location.pathname).toBe("/admin/people/groups"),
    );
  });

  it("should send a manager home when they give up their last managed group", async () => {
    const { router } = setup({
      initialRoute: `/admin/people/groups/${COLLECTION_GROUP_ID}`,
      groups: [COLLECTION_GROUP],
      memberships: [managerMembership(COLLECTION_GROUP_ID, 100)],
    });

    await screen.findByText("Manager");
    await userEvent.click(
      within(await screen.findByRole("table")).getByLabelText("close icon"),
    );

    await confirmLosingManagement();

    await waitFor(async () =>
      expect(
        (await findRequests("DELETE")).map(({ url }) => url),
      ).toContainEqual(
        expect.stringContaining("/api/permissions/membership/100"),
      ),
    );
    await waitFor(() => expect(router?.location.pathname).toBe("/"));
  });
});

describe("group managers on the people page", () => {
  it("should send a manager home when they remove their last managed group", async () => {
    const { router } = setup({
      initialRoute: "/admin/people",
      groups: [COLLECTION_GROUP],
      memberships: [managerMembership(COLLECTION_GROUP_ID, 100)],
    });

    await userEvent.click(await screen.findByLabelText("group-summary"));
    await userEvent.click(
      await screen.findByRole("button", { name: "collection" }),
    );

    await confirmLosingManagement();

    await waitFor(() => expect(router?.location.pathname).toBe("/"));
  });
});

describe("group managers removing groups", () => {
  it("should send a manager home after they remove their last group", async () => {
    const { router } = setup({
      initialRoute: "/admin/people/groups",
      groups: [COLLECTION_GROUP],
      memberships: [managerMembership(COLLECTION_GROUP_ID, 100)],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "group-action-button" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Remove Group" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove group" }));

    await waitFor(() => expect(router?.location.pathname).toBe("/"));
  });

  it("should keep a manager on the groups list while they still manage one", async () => {
    const { router } = setup({
      initialRoute: "/admin/people/groups",
      groups: [COLLECTION_GROUP, DATA_GROUP],
      memberships: [
        managerMembership(COLLECTION_GROUP_ID, 100),
        managerMembership(DATA_GROUP_ID, 101),
      ],
    });

    await userEvent.click(
      (
        await screen.findAllByRole("button", { name: "group-action-button" })
      )[0],
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Remove Group" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove group" }));

    await waitFor(async () =>
      expect(await findRequests("DELETE")).toHaveLength(1),
    );
    expect(router?.location.pathname).toBe("/admin/people/groups");
  });
});
