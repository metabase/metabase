import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { GroupInfo, Member, TokenFeatures } from "metabase-types/api";
import {
  createMockGroup,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { MembershipSelect } from "./MembershipSelect";

const ALL_USERS = createMockGroup({
  id: 1,
  name: "All Users",
  magic_group_type: "all-internal-users",
});
const DATA_ANALYSTS = createMockGroup({
  id: 2,
  name: "Data Analysts",
  magic_group_type: "data-analyst",
});
const MARKETING = createMockGroup({
  id: 3,
  name: "Marketing",
  magic_group_type: null,
});
const GROUPS: GroupInfo[] = [ALL_USERS, DATA_ANALYSTS, MARKETING];

const ADD_DISABLED_MESSAGE =
  "Adding members to this group requires Advanced Permissions. Members can only be removed.";

const setup = ({
  memberGroupIds = [ALL_USERS.id],
  tokenFeatures = {},
}: {
  memberGroupIds?: number[];
  tokenFeatures?: Partial<TokenFeatures>;
} = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  const memberships = new Map<number, Partial<Member>>(
    memberGroupIds.map((id) => [id, { group_id: id }]),
  );

  const onAdd = jest.fn();
  const onRemove = jest.fn();

  renderWithProviders(
    <MembershipSelect
      groups={GROUPS}
      memberships={memberships}
      isUserAdmin={false}
      onAdd={onAdd}
      onRemove={onRemove}
      onChange={jest.fn()}
    />,
    { storeInitialState: createMockState({ settings }) },
  );

  return { onAdd, onRemove };
};

const openPicker = () =>
  userEvent.click(screen.getByLabelText("group-summary"));

const getGroupItem = (name: string) => screen.getByRole("listitem", { name });

describe("MembershipSelect", () => {
  describe("without the advanced-permissions feature", () => {
    it("does not add the user to the Data Analysts group and explains why", async () => {
      const { onAdd } = setup();
      await openPicker();

      await userEvent.click(getGroupItem("Data Analysts"));
      expect(onAdd).not.toHaveBeenCalled();

      await userEvent.hover(getGroupItem("Data Analysts"));
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        ADD_DISABLED_MESSAGE,
      );
    });

    it("still removes an existing Data Analysts member", async () => {
      const { onRemove } = setup({
        memberGroupIds: [ALL_USERS.id, DATA_ANALYSTS.id],
      });
      await openPicker();

      await userEvent.click(getGroupItem("Data Analysts"));

      expect(onRemove).toHaveBeenCalledWith(DATA_ANALYSTS.id);
    });

    it("leaves other groups addable", async () => {
      const { onAdd } = setup();
      await openPicker();

      await userEvent.click(getGroupItem("Marketing"));

      expect(onAdd).toHaveBeenCalledWith(MARKETING.id, {
        is_group_manager: false,
      });
    });

    it("keeps the Data Analysts group pinned above the custom groups", async () => {
      setup();
      await openPicker();

      const lists = screen.getAllByRole("list");
      expect(
        within(lists[0]).getByRole("listitem", { name: "Data Analysts" }),
      ).toBeInTheDocument();
      expect(
        within(lists[1]).getByRole("listitem", { name: "Marketing" }),
      ).toBeInTheDocument();
    });
  });

  describe("with the advanced-permissions feature", () => {
    it("adds the user to the Data Analysts group", async () => {
      const { onAdd } = setup({
        tokenFeatures: { advanced_permissions: true },
      });
      await openPicker();

      await userEvent.click(getGroupItem("Data Analysts"));

      expect(onAdd).toHaveBeenCalledWith(DATA_ANALYSTS.id, {
        is_group_manager: false,
      });
    });

    it("keeps the Data Analysts group pinned above the custom groups", async () => {
      setup({ tokenFeatures: { advanced_permissions: true } });
      await openPicker();

      const lists = screen.getAllByRole("list");
      expect(
        within(lists[0]).getByRole("listitem", { name: "Data Analysts" }),
      ).toBeInTheDocument();
      expect(
        within(lists[1]).getByRole("listitem", { name: "Marketing" }),
      ).toBeInTheDocument();
    });
  });
});
