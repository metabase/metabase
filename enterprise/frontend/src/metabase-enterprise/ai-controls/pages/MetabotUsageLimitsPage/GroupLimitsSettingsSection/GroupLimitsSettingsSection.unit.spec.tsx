import userEvent from "@testing-library/user-event";

import { setupGroupsEndpoint } from "__support__/server-mocks/group";
import {
  setupAIControlsGroupLimitsEndpoint,
  setupAIControlsInstanceLimitEndpoint,
  setupAIControlsTenantLimitsEndpoint,
  setupUpdateAIControlsGroupLimitEndpoint,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type { MetabotGroupLimit } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";

import { GroupLimitsSettingsSection } from "./GroupLimitsSettingsSection";

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

const defaultGroups = [adminGroup, allUsersGroup];

function setup({
  useTenants = false,
  groups = defaultGroups,
  groupLimits = [] as MetabotGroupLimit[],
  instanceMaxUsage = null as number | null,
} = {}) {
  setupGroupsEndpoint(groups);
  setupAIControlsGroupLimitsEndpoint(groupLimits);
  setupAIControlsInstanceLimitEndpoint({ max_usage: instanceMaxUsage });
  setupAIControlsTenantLimitsEndpoint([]);
  setupUpdateAIControlsGroupLimitEndpoint();

  renderWithProviders(<GroupLimitsSettingsSection />, {
    storeInitialState: {
      settings: createMockSettingsState({
        "use-tenants": useTenants,
        "metabot-limit-unit": "tokens",
        "metabot-limit-reset-rate": "monthly",
      }),
    },
  });
}

describe("GroupLimitsSettingsSection", () => {
  it("renders group names with limit inputs when not using tenants", async () => {
    setup();

    expect(await screen.findByText("Group limits")).toBeInTheDocument();
    expect(await screen.findByText("Administrators")).toBeInTheDocument();
    expect(screen.getByText("All Users")).toBeInTheDocument();
  });

  it("does not show tabs when not using tenants", async () => {
    setup({ useTenants: false });
    await screen.findByText("Group limits");

    expect(screen.queryByText("User groups")).not.toBeInTheDocument();
    expect(screen.queryByText("Tenant groups")).not.toBeInTheDocument();
  });

  it("shows tabs when using tenants", async () => {
    setup({ useTenants: true });

    expect(
      await screen.findByText("Group and tenant limits"),
    ).toBeInTheDocument();
    expect(screen.getByText("User groups")).toBeInTheDocument();
    expect(screen.getByText("Tenant groups")).toBeInTheDocument();
    expect(screen.getByText("Specific tenants")).toBeInTheDocument();
  });

  it("switches between tabs when using tenants", async () => {
    setup({ useTenants: true });
    await screen.findByText("Group and tenant limits");

    await userEvent.click(screen.getByText("Specific tenants"));

    expect(
      screen.getByText(/set total token usage limits for specific tenants/),
    ).toBeInTheDocument();
  });

  it("shows 'Unlimited' placeholder when no instance limit is set", async () => {
    setup({ instanceMaxUsage: null });
    await screen.findByText("Administrators");

    const inputs = screen.getAllByPlaceholderText("Unlimited");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("shows instance limit as placeholder when set", async () => {
    setup({ instanceMaxUsage: 1000 });
    await screen.findByText("Administrators");

    const inputs = screen.getAllByPlaceholderText("1000");
    expect(inputs.length).toBeGreaterThan(0);
  });
});
