import userEvent from "@testing-library/user-event";

import { setupUpdateAIControlsGroupLimitEndpoint } from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  GroupInfo,
  MetabotGroupLimit,
  MetabotLimitPeriod,
  MetabotLimitType,
} from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";

import { GroupLimitsTab } from "./GroupLimitsTab";

const adminGroup = createMockGroup({
  id: 1,
  name: "Administrators",
  magic_group_type: "admin",
});
const allUsersGroup = createMockGroup({
  id: 2,
  name: "All Users",
  magic_group_type: "all-internal-users",
});
const marketingGroup = createMockGroup({
  id: 3,
  name: "Marketing",
  magic_group_type: null,
});
const defaultGroups = [adminGroup, marketingGroup];

type SetupOpts = Partial<{
  groups: GroupInfo[];
  groupLimits: MetabotGroupLimit[];
  instanceLimit: number | null;
  limitType: MetabotLimitType;
  limitPeriod: MetabotLimitPeriod;
  variant: "regular-groups" | "tenant-groups";
  hasError: boolean;
  isLoading: boolean;
  allUsersGroupProp: GroupInfo;
  allUsersGroupLimit: number | null | undefined;
}>;

function setup({
  groups = defaultGroups,
  groupLimits = [],
  instanceLimit = null,
  limitType = "tokens",
  limitPeriod = "monthly",
  variant = "regular-groups",
  hasError = false,
  isLoading = false,
  allUsersGroupProp = undefined,
  allUsersGroupLimit = undefined,
}: SetupOpts = {}) {
  setupUpdateAIControlsGroupLimitEndpoint();

  renderWithProviders(
    <GroupLimitsTab
      hasGroupsError={hasError}
      groupLimits={groupLimits}
      groups={groups}
      instanceLimit={instanceLimit}
      isLoading={isLoading}
      limitPeriod={limitPeriod}
      limitType={limitType}
      variant={variant}
      allUsersGroup={allUsersGroupProp}
      allUsersGroupLimit={allUsersGroupLimit}
    />,
  );
}

describe("GroupLimitsTab", () => {
  it("renders a row for each group with a limit input", () => {
    setup();

    expect(screen.getByText("Administrators")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();

    const adminInput = screen.getByRole("spinbutton", {
      name: /Administrators/,
    });
    expect(adminInput).toBeInTheDocument();
  });

  it("shows token-based column header when limitType is tokens", () => {
    setup({ limitType: "tokens" });

    expect(screen.getByText(/Max tokens per user/)).toBeInTheDocument();
  });

  it("shows message-based column header when limitType is messages", () => {
    setup({ limitType: "messages" });

    expect(screen.getByText(/Max messages per user/)).toBeInTheDocument();
  });

  it("shows 'Group' column header for regular-groups variant", () => {
    setup({ variant: "regular-groups" });
    expect(screen.getByText("Group")).toBeInTheDocument();
  });

  it("shows 'Tenant group' column header for tenant-groups variant", () => {
    setup({ variant: "tenant-groups" });
    expect(screen.getByText("Tenant group")).toBeInTheDocument();
  });

  it("populates inputs from existing group limits", () => {
    setup({
      groupLimits: [
        { group_id: adminGroup.id, max_usage: 100 },
        { group_id: marketingGroup.id, max_usage: 50 },
      ],
    });

    expect(screen.getByDisplayValue("100")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();
  });

  it("shows 'Unlimited' placeholder when instance limit is null", () => {
    setup({ instanceLimit: null });

    const inputs = screen.getAllByPlaceholderText("Unlimited");
    expect(inputs).toHaveLength(2);
  });

  it("shows instance limit value as placeholder when set", () => {
    setup({ instanceLimit: 500 });

    const inputs = screen.getAllByPlaceholderText("500");
    expect(inputs).toHaveLength(2);
  });

  it("updates the input value when user types", async () => {
    setup();

    const adminInput = screen.getByRole("spinbutton", {
      name: /Administrators/,
    });
    await userEvent.type(adminInput, "250");

    expect(adminInput).toHaveValue(250);
  });

  it("shows error message when error is present", () => {
    setup({ hasError: true, groups: undefined });
    expect(screen.getByText("Error loading groups")).toBeInTheDocument();
  });

  it("shows tenant-specific error when variant is tenant-groups", () => {
    setup({
      hasError: true,
      groups: undefined,
      variant: "tenant-groups",
    });

    expect(screen.getByText("Error loading tenant groups")).toBeInTheDocument();
  });

  it("uses the correct period noun in column headers", () => {
    setup({ limitPeriod: "weekly", limitType: "tokens" });

    expect(screen.getByText(/each week/)).toBeInTheDocument();
  });

  it("shows error when value exceeds the instance limit", async () => {
    setup({ instanceLimit: 100 });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const adminsGroupInput = screen.getByLabelText(
      /Max tokens per user for Administrators/,
    );
    await userEvent.type(adminsGroupInput, "200");

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(
        /Can't be higher than the instance limit/,
      );
    });
  });

  describe("'All Users' group override warning icons", () => {
    it("shows info icon next to a group's input when 'All Users' has a higher limit", () => {
      // All Users limit = 500 (unlimited from perspective of Marketing which has 100)
      setup({
        groups: [allUsersGroup, marketingGroup],
        groupLimits: [
          { group_id: allUsersGroup.id, max_usage: 500 },
          { group_id: marketingGroup.id, max_usage: 100 },
        ],
        allUsersGroupProp: allUsersGroup,
        allUsersGroupLimit: 500,
      });

      const marketingRow = screen.getByRole("row", { name: /Marketing/ });
      expect(
        within(marketingRow).getByRole("img", { name: "Group limit warning" }),
      ).toBeInTheDocument();
    });

    it("shows info icon when 'All Users' limit is unlimited (null) and group has a limit set", () => {
      setup({
        groups: [allUsersGroup, marketingGroup],
        groupLimits: [{ group_id: marketingGroup.id, max_usage: 100 }],
        allUsersGroupProp: allUsersGroup,
        allUsersGroupLimit: null, // unlimited
      });

      const marketingRow = screen.getByRole("row", { name: /Marketing/ });
      expect(
        within(marketingRow).getByRole("img", { name: "Group limit warning" }),
      ).toBeInTheDocument();
    });

    it("does not show info icon when group has no limit set (unlimited input)", () => {
      // Marketing has no limit — no icon, nothing to override
      setup({
        groups: [allUsersGroup, marketingGroup],
        groupLimits: [],
        allUsersGroupProp: allUsersGroup,
        allUsersGroupLimit: null,
      });

      const marketingRow = screen.getByRole("row", { name: /Marketing/ });
      expect(
        within(marketingRow).queryByRole("img", {
          name: "Group limit warning",
        }),
      ).not.toBeInTheDocument();
    });

    it("does not show info icon when 'All Users' limit equals the group's limit", () => {
      setup({
        groups: [allUsersGroup, marketingGroup],
        groupLimits: [
          { group_id: allUsersGroup.id, max_usage: 100 },
          { group_id: marketingGroup.id, max_usage: 100 },
        ],
        allUsersGroupProp: allUsersGroup,
        allUsersGroupLimit: 100,
      });

      const marketingRow = screen.getByRole("row", { name: /Marketing/ });
      expect(
        within(marketingRow).queryByRole("img", {
          name: "Group limit warning",
        }),
      ).not.toBeInTheDocument();
    });

    it("does not show info icon when 'All Users' limit is lower than the group's limit", () => {
      setup({
        groups: [allUsersGroup, marketingGroup],
        groupLimits: [
          { group_id: allUsersGroup.id, max_usage: 50 },
          { group_id: marketingGroup.id, max_usage: 100 },
        ],
        allUsersGroupProp: allUsersGroup,
        allUsersGroupLimit: 50,
      });

      const marketingRow = screen.getByRole("row", { name: /Marketing/ });
      expect(
        within(marketingRow).queryByRole("img", {
          name: "Group limit warning",
        }),
      ).not.toBeInTheDocument();
    });

    it("does not show info icon on the 'All Users' row itself", () => {
      setup({
        groups: [allUsersGroup, marketingGroup],
        groupLimits: [{ group_id: marketingGroup.id, max_usage: 100 }],
        allUsersGroupProp: allUsersGroup,
        allUsersGroupLimit: null,
      });

      const allUsersRow = screen.getByRole("row", { name: /All Users/ });
      expect(
        within(allUsersRow).queryByRole("img", { name: "Group limit warning" }),
      ).not.toBeInTheDocument();
    });
  });
});
