import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupUsersEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { getIcon, renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Group, Member, TokenFeatures } from "metabase-types/api";
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
}: {
  group: Group;
  tokenFeatures?: Partial<TokenFeatures>;
}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  setupUsersEndpoints([]);
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
        "Adding members to this group requires Advanced Permissions. Members can only be removed.",
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
