import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { Group, Member } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { GroupMembersTable } from "./GroupMembersTable";

const createMockMember = (opts?: Partial<Member>): Member => ({
  user_id: 1,
  group_id: 1,
  membership_id: 1,
  email: "user@example.com",
  first_name: "Test",
  last_name: "User",
  is_group_manager: false,
  is_superuser: false,
  ...opts,
});

const createMockGroupWithMembers = (opts?: Partial<Group>): Group => ({
  id: 1,
  name: "Test Group",
  member_count: 1,
  members: [createMockMember()],
  magic_group_type: null,
  ...opts,
});

const setup = ({ group }: { group: Group }) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: true,
      tenants: true,
    }),
    "use-tenants": true,
  });

  setupEnterprisePlugins();

  renderWithProviders(
    <GroupMembersTable
      group={group}
      showAddUser={false}
      onAddUserCancel={jest.fn()}
      onAddUserDone={jest.fn()}
      onMembershipRemove={jest.fn()}
      onMembershipUpdate={jest.fn()}
    />,
    {
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
};

describe("GroupMembersTable", () => {
  describe("Type column (manager toggle)", () => {
    it("should show Type column for regular groups", () => {
      setup({
        group: createMockGroupWithMembers({
          name: "Regular Group",
          is_tenant_group: false,
        }),
      });

      expect(screen.getByText("Type")).toBeInTheDocument();
    });

    it("should NOT show Type column for tenant groups", () => {
      setup({
        group: createMockGroupWithMembers({
          name: "Tenant Group",
          is_tenant_group: true,
        }),
      });

      expect(screen.queryByText("Type")).not.toBeInTheDocument();
    });
  });
});
