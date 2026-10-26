import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { findRequests, setupUsersEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { getIcon, renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  Group,
  Member,
  TokenFeatures,
  UserListResult,
} from "metabase-types/api";
import {
  createMockGroup,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { GroupDetail } from "./GroupDetail";

const currentUser = createMockUser({ id: 1, is_superuser: true });

const MEMBERSHIP_ID = 10;
const MEMBERSHIP_PATH = `path:/api/permissions/membership/${MEMBERSHIP_ID}`;

const createMockMember = (opts?: Partial<Member>): Member => ({
  user_id: 2,
  group_id: 5,
  membership_id: MEMBERSHIP_ID,
  email: "analyst@example.com",
  first_name: "Ana",
  last_name: "Lyst",
  is_group_manager: false,
  is_superuser: false,
  ...opts,
});

const createMockGroupWithMembers = ({
  members = [createMockMember()],
  ...opts
}: Partial<Group> = {}): Group => ({
  ...createMockGroup(opts),
  members,
});

const DATA_ANALYSTS = createMockGroupWithMembers({
  id: 5,
  name: "Data Analysts",
  magic_group_type: "data-analyst",
});

const MARKETING = createMockGroupWithMembers({
  id: 6,
  name: "Marketing",
  magic_group_type: null,
  members: [createMockMember({ group_id: 6, membership_id: 11 })],
});

const TENANT_GROUP = createMockGroupWithMembers({
  id: 7,
  name: "Marketing Team",
  magic_group_type: null,
  is_tenant_group: true,
  members: [],
});

const TENANT_USER = createMockUser({
  id: 3,
  first_name: "gizmo",
  last_name: "user",
  common_name: "gizmo user",
  email: "gizmo.user@email.com",
  tenant_id: 1,
});

// The tenants plugin decides whether a group is a tenant group, so it has to be
// registered before any test renders.
beforeAll(() => {
  mockSettings({
    "token-features": createMockTokenFeatures({ tenants: true }),
  });
  setupEnterpriseOnlyPlugin("tenants");
});

const setup = ({
  group,
  tokenFeatures = {},
  users = [],
}: {
  group: Group;
  tokenFeatures?: Partial<TokenFeatures>;
  users?: UserListResult[];
}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  setupUsersEndpoints(users);
  fetchMock.post("path:/api/permissions/membership", 200);
  fetchMock.delete(MEMBERSHIP_PATH, 204);

  renderWithProviders(
    <GroupDetail
      group={group}
      membershipsByUser={{}}
      currentUser={currentUser}
    />,
    { storeInitialState: createMockState({ settings, currentUser }) },
  );
};

const getAddMembersButton = () =>
  screen.getByRole("button", { name: "Add members" });

describe("GroupDetail", () => {
  describe("tenant group", () => {
    it("searches tenant users only, and adds the chosen one", async () => {
      setup({ group: TENANT_GROUP, users: [TENANT_USER] });

      await userEvent.click(getAddMembersButton());

      const listRequests = (await findRequests("GET")).filter(({ url }) =>
        url.includes("/api/user"),
      );
      expect(listRequests).toHaveLength(1);
      expect(listRequests[0].url).toContain("tenancy=external");

      await userEvent.type(
        screen.getByPlaceholderText(/Julie McMemberson/),
        "gizmo",
      );
      await userEvent.click(await screen.findByText("gizmo user"));
      await userEvent.click(screen.getByRole("button", { name: "Add" }));

      const [created] = (await findRequests("POST")).filter(({ url }) =>
        url.includes("/api/permissions/membership"),
      );
      expect(created.body).toEqual({
        group_id: TENANT_GROUP.id,
        user_id: TENANT_USER.id,
      });
    });

    it("searches all users for a group that is not a tenant group", async () => {
      setup({ group: MARKETING, users: [TENANT_USER] });

      await userEvent.click(getAddMembersButton());

      const listRequests = (await findRequests("GET")).filter(({ url }) =>
        url.includes("/api/user"),
      );
      expect(listRequests).toHaveLength(1);
      expect(listRequests[0].url).not.toContain("tenancy");
    });
  });

  describe("without the advanced-permissions feature", () => {
    it("disables adding members to the Data Analysts group and explains why", async () => {
      setup({ group: DATA_ANALYSTS });

      expect(getAddMembersButton()).toBeDisabled();

      await userEvent.hover(getAddMembersButton());
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Adding members to this group requires a plan that includes the Data Analysts group. Members can only be removed.",
      );
    });

    it("keeps member removal working on the Data Analysts group", async () => {
      setup({ group: DATA_ANALYSTS });

      expect(screen.getByText("analyst@example.com")).toBeInTheDocument();
      await userEvent.click(getIcon("close"));

      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls(MEMBERSHIP_PATH, { method: "DELETE" }),
        ).toHaveLength(1),
      );
    });

    it("leaves other groups' add-members button enabled", () => {
      setup({ group: MARKETING });

      expect(getAddMembersButton()).toBeEnabled();
    });
  });

  describe("with the advanced-permissions feature", () => {
    it("leaves adding members to the Data Analysts group enabled", async () => {
      setup({
        group: DATA_ANALYSTS,
        tokenFeatures: { advanced_permissions: true },
      });

      expect(getAddMembersButton()).toBeEnabled();

      await userEvent.click(getAddMembersButton());
      expect(getAddMembersButton()).toBeDisabled();
    });

    it("puts no tooltip on the add-members button", async () => {
      setup({
        group: DATA_ANALYSTS,
        tokenFeatures: { advanced_permissions: true },
      });

      await userEvent.hover(getAddMembersButton());

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });
});
