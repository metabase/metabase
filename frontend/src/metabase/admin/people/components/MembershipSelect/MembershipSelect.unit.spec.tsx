import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
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
  "Adding members to this group requires a plan that includes the Data Analysts group. Members can only be removed.";

const setup = ({
  memberGroupIds = [ALL_USERS.id],
  managerGroupIds = [],
  tokenFeatures = {},
  groups = GROUPS,
  withGroupManagers = false,
}: {
  memberGroupIds?: number[];
  managerGroupIds?: number[];
  tokenFeatures?: Partial<TokenFeatures>;
  groups?: GroupInfo[];
  withGroupManagers?: boolean;
} = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  if (withGroupManagers) {
    setupEnterpriseOnlyPlugin("group_managers");
  }
  const memberships = new Map<number, Partial<Member>>(
    memberGroupIds.map((id) => [
      id,
      { group_id: id, is_group_manager: managerGroupIds.includes(id) },
    ]),
  );

  const onAdd = jest.fn();
  const onRemove = jest.fn();
  const onChange = jest.fn();

  renderWithProviders(
    <MembershipSelect
      groups={groups}
      memberships={memberships}
      isUserAdmin={false}
      onAdd={onAdd}
      onRemove={onRemove}
      onChange={onChange}
    />,
    { storeInitialState: createMockState({ settings }) },
  );

  return { onAdd, onRemove, onChange };
};

const openPicker = () =>
  userEvent.click(screen.getByLabelText("group-summary"));

const getGroupItem = (name: string) => screen.getByRole("button", { name });

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

    it("exposes each row as a toggle button with its membership and gating state", async () => {
      setup({ memberGroupIds: [ALL_USERS.id, MARKETING.id] });
      await openPicker();

      expect(getGroupItem("Marketing")).toHaveAttribute("aria-pressed", "true");
      expect(getGroupItem("Marketing")).not.toHaveAttribute("aria-disabled");
      expect(getGroupItem("Data Analysts")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(getGroupItem("Data Analysts")).toHaveAttribute(
        "aria-disabled",
        "true",
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
        within(lists[0]).getByRole("button", { name: "Data Analysts" }),
      ).toBeInTheDocument();
      expect(
        within(lists[1]).getByRole("button", { name: "Marketing" }),
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
        within(lists[0]).getByRole("button", { name: "Data Analysts" }),
      ).toBeInTheDocument();
      expect(
        within(lists[1]).getByRole("button", { name: "Marketing" }),
      ).toBeInTheDocument();
    });
  });
});

describe("MembershipSelect summary", () => {
  it("should say Default when the user is only in the default group", () => {
    setup();

    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("should name the one group the user is in besides the default", () => {
    setup({ memberGroupIds: [ALL_USERS.id, MARKETING.id] });

    expect(screen.getByText("Marketing")).toBeInTheDocument();
  });

  it("should count the groups once there is more than one", () => {
    setup({ memberGroupIds: [ALL_USERS.id, MARKETING.id, DATA_ANALYSTS.id] });

    expect(screen.getByText("2 other groups")).toBeInTheDocument();
  });

  it("should say Admin for a member of the Administrators group", () => {
    const administrators = createMockGroup({
      id: 4,
      name: "Administrators",
      magic_group_type: "admin",
    });
    setup({
      groups: [...GROUPS, administrators],
      memberGroupIds: [ALL_USERS.id, administrators.id],
    });

    expect(screen.getByText("Admin")).toBeInTheDocument();
  });
});

describe("MembershipSelect manager toggle", () => {
  it("should promote a member to manager and demote them again", async () => {
    const { onChange } = setup({
      memberGroupIds: [ALL_USERS.id, MARKETING.id],
      tokenFeatures: { advanced_permissions: true },
      withGroupManagers: true,
    });
    await openPicker();

    await userEvent.click(
      screen.getByRole("button", { name: "Turn into Manager" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(MARKETING.id, {
      is_group_manager: true,
    });
  });

  it("should demote a manager back to member", async () => {
    const { onChange } = setup({
      memberGroupIds: [ALL_USERS.id, MARKETING.id],
      managerGroupIds: [MARKETING.id],
      tokenFeatures: { advanced_permissions: true },
      withGroupManagers: true,
    });
    await openPicker();

    await userEvent.click(
      screen.getByRole("button", { name: "Turn into Member" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(MARKETING.id, {
      is_group_manager: false,
    });
  });
});
