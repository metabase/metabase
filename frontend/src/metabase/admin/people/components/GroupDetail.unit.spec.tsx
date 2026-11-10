import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupMembershipMutationEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  getIcon,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { Group, Member, TokenFeatures, User } from "metabase-types/api";
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

const setup = ({
  group,
  tokenFeatures = {},
  users = [],
}: {
  group: Group;
  tokenFeatures?: Partial<TokenFeatures>;
  users?: User[];
}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  setupUsersEndpoints(users);
  setupMembershipMutationEndpoints();
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

const ALL_USERS = createMockGroupWithMembers({
  id: 1,
  name: "All Users",
  magic_group_type: "all-internal-users",
  members: [
    createMockMember({ group_id: 1, membership_id: 20 }),
    createMockMember({
      group_id: 1,
      membership_id: 21,
      user_id: 3,
      first_name: "Bobby",
      last_name: "Tables",
      email: "bobby@example.com",
    }),
  ],
});

const EMPTY_MARKETING = createMockGroupWithMembers({
  id: 6,
  name: "Marketing",
  magic_group_type: null,
  members: [],
});

describe("GroupDetail member counts", () => {
  it("should count the members of a group", () => {
    setup({ group: ALL_USERS });

    expect(screen.getByText("2 members")).toBeInTheDocument();
  });

  it("should count a single member in the singular", () => {
    setup({ group: MARKETING });

    expect(screen.getByText("1 member")).toBeInTheDocument();
  });

  it("should ask an empty group to get started", () => {
    setup({ group: EMPTY_MARKETING });

    expect(screen.getByText("0 members")).toBeInTheDocument();
    expect(screen.getByText("Add members to get started.")).toBeInTheDocument();
  });
});

describe("GroupDetail for the All Users group", () => {
  it("should not offer to add members", () => {
    setup({ group: ALL_USERS });

    expect(
      screen.queryByRole("button", { name: "Add members" }),
    ).not.toBeInTheDocument();
  });

  it("should not offer to remove a member", () => {
    setup({ group: ALL_USERS });

    expect(screen.getByText("analyst@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
  });

  it("should explain that everybody belongs to it", () => {
    setup({ group: ALL_USERS });

    expect(
      screen.getByText(/All users belong to the All Users group/),
    ).toBeInTheDocument();
  });
});

describe("GroupDetail adding members", () => {
  const CANDIDATE = createMockUser({
    id: 7,
    first_name: "Testy",
    last_name: "McTestface",
    email: "testy@example.com",
  });

  it("should add the picked user to the group", async () => {
    setup({ group: EMPTY_MARKETING, users: [CANDIDATE] });

    await userEvent.click(getAddMembersButton());
    await userEvent.type(
      await screen.findByLabelText("Search for a user to add"),
      "Testy",
    );
    await userEvent.click(await screen.findByText("Testy McTestface"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(async () =>
      expect(await findRequests("POST")).toHaveLength(1),
    );
    const [{ url, body }] = await findRequests("POST");
    expect(url).toContain("/api/permissions/membership");
    expect(body).toEqual({
      group_id: EMPTY_MARKETING.id,
      user_id: CANDIDATE.id,
    });
  });

  it("should close the add row once the members are added", async () => {
    setup({ group: EMPTY_MARKETING, users: [CANDIDATE] });

    await userEvent.click(getAddMembersButton());
    await userEvent.type(
      await screen.findByLabelText("Search for a user to add"),
      "Testy",
    );
    await userEvent.click(await screen.findByText("Testy McTestface"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(
        screen.queryByLabelText("Search for a user to add"),
      ).not.toBeInTheDocument(),
    );
    expect(getAddMembersButton()).toBeEnabled();
  });

  it("should not suggest a user who is already a member", async () => {
    const member = MARKETING.members[0];
    setup({
      group: MARKETING,
      users: [
        CANDIDATE,
        createMockUser({
          id: member.user_id,
          first_name: member.first_name,
          last_name: member.last_name,
          email: member.email,
        }),
      ],
    });

    await userEvent.click(getAddMembersButton());
    await userEvent.type(
      await screen.findByLabelText("Search for a user to add"),
      "a",
    );

    const suggestions = within(await screen.findByRole("dialog"));
    expect(suggestions.getByText("Testy McTestface")).toBeInTheDocument();
    expect(suggestions.queryByText("Ana Lyst")).not.toBeInTheDocument();
    // ...while the member they already are stays in the table.
    expect(screen.getByText("Ana Lyst")).toBeInTheDocument();
  });
});
