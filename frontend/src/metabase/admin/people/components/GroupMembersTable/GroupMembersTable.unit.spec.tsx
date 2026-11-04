import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { Group, Member } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

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

const PAGE_SIZE = 25;

const createMembers = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    createMockMember({
      user_id: index + 1,
      membership_id: index + 1,
      first_name: `Member${index}`,
      last_name: "Tableton",
      email: `member${index}@example.com`,
    }),
  );

const getMemberRows = () =>
  within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("GroupMembersTable pagination", () => {
  it("should page the members forward and backward", async () => {
    const total = PAGE_SIZE + 1;
    setup({
      group: createMockGroupWithMembers({ members: createMembers(total) }),
    });

    expect(getMemberRows()).toHaveLength(PAGE_SIZE);
    expect(screen.getByText(`1 - ${PAGE_SIZE}`)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText(`${PAGE_SIZE + 1} - ${total}`)).toBeInTheDocument();
    expect(getMemberRows()).toHaveLength(total - PAGE_SIZE);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Previous page" }),
    );

    expect(screen.getByText(`1 - ${PAGE_SIZE}`)).toBeInTheDocument();
    expect(getMemberRows()).toHaveLength(PAGE_SIZE);
  });
});

describe("GroupMembersTable API key members", () => {
  it("should label an API key member and link to the API key settings", () => {
    setup({
      group: createMockGroupWithMembers({
        members: [
          createMockMember({
            user_id: 2,
            membership_id: 2,
            first_name: "MyApiKey",
            last_name: "",
            // API-key members have no real email; the suffix is how the app
            // tells them apart from people.
            email: "mykey@api-key.invalid",
          }),
        ],
      }),
    });

    expect(screen.getByText("MyApiKey")).toBeInTheDocument();
    expect(screen.getByText("API Key")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/admin/settings/authentication/api-keys",
    );
  });
});

describe("GroupMembersTable empty group", () => {
  it("should ask an empty group to get started", () => {
    setup({ group: createMockGroupWithMembers({ members: [] }) });

    expect(screen.getByText("Add members to get started.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
