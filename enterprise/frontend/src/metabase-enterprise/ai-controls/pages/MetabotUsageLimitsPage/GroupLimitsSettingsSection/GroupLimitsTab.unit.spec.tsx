import userEvent from "@testing-library/user-event";

import { setupUpdateAIControlsGroupLimitEndpoint } from "__support__/server-mocks/metabot";
import { renderWithProviders, screen } from "__support__/ui";
import type {
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
const marketingGroup = createMockGroup({
  id: 2,
  name: "Marketing",
  magic_group_type: null,
});
const defaultGroups = [adminGroup, marketingGroup];

function setup({
  groups = defaultGroups,
  groupLimits = [] as MetabotGroupLimit[],
  instanceLimit = null as number | null,
  limitType = "tokens" as MetabotLimitType,
  limitPeriod = "monthly" as MetabotLimitPeriod,
  variant = "regular-groups" as "regular-groups" | "tenant-groups",
  error = null as unknown,
  isLoading = false,
} = {}) {
  setupUpdateAIControlsGroupLimitEndpoint();

  renderWithProviders(
    <GroupLimitsTab
      error={error}
      groupLimits={groupLimits}
      groups={groups}
      instanceLimit={instanceLimit}
      isLoading={isLoading}
      limitPeriod={limitPeriod}
      limitType={limitType}
      variant={variant}
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

  it("shows conversation-based column header when limitType is conversations", () => {
    setup({ limitType: "conversations" });

    expect(screen.getByText(/Max conversations per user/)).toBeInTheDocument();
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
        { group_id: 1, max_usage: 100 },
        { group_id: 2, max_usage: 50 },
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
    setup({ error: new Error("fail"), groups: undefined });

    expect(screen.getByText("Error loading groups")).toBeInTheDocument();
  });

  it("shows tenant-specific error when variant is tenant-groups", () => {
    setup({
      error: new Error("fail"),
      groups: undefined,
      variant: "tenant-groups",
    });

    expect(screen.getByText("Error loading tenant groups")).toBeInTheDocument();
  });

  it("uses the correct period noun in column headers", () => {
    setup({ limitPeriod: "weekly", limitType: "tokens" });

    expect(screen.getByText(/each week/)).toBeInTheDocument();
  });
});
