import userEvent from "@testing-library/user-event";

import { setupUpdateAIControlsTenantLimitEndpoint } from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  MetabotLimitPeriod,
  MetabotLimitType,
  MetabotTenantLimit,
  Tenant,
} from "metabase-types/api";

import { TenantLimitsTab } from "./TenantLimitsTab";

const createMockTenant = (opts?: Partial<Tenant>): Tenant => ({
  id: 1,
  name: "Acme Corp",
  slug: "acme-corp",
  member_count: 10,
  is_active: true,
  attributes: null,
  tenant_collection_id: null,
  ...opts,
});

const tenant1 = createMockTenant({ id: 1, name: "Acme Corp", slug: "acme" });
const tenant2 = createMockTenant({
  id: 2,
  name: "Beta Inc",
  slug: "beta-inc",
});
const defaultTenants = [tenant1, tenant2];

type SetupOpts = Partial<{
  tenants: Tenant[];
  tenantLimits: MetabotTenantLimit[];
  instanceLimit: number | null;
  limitType: MetabotLimitType;
  limitPeriod: MetabotLimitPeriod;
  hasError: boolean;
  isLoading: boolean;
}>;

function setup({
  tenants = defaultTenants,
  tenantLimits = [],
  instanceLimit = null,
  limitType = "tokens",
  limitPeriod = "monthly",
  hasError = false,
  isLoading = false,
}: SetupOpts = {}) {
  setupUpdateAIControlsTenantLimitEndpoint();

  renderWithProviders(
    <TenantLimitsTab
      hasTenantsError={hasError}
      instanceLimit={instanceLimit}
      isLoading={isLoading}
      limitPeriod={limitPeriod}
      limitType={limitType}
      tenantLimits={tenantLimits}
      tenants={tenants}
    />,
  );
}

describe("TenantLimitsTab", () => {
  it("renders a row for each tenant with a limit input", () => {
    setup();

    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Beta Inc")).toBeInTheDocument();
  });

  it("shows token-based column header when limitType is tokens", () => {
    setup({ limitType: "tokens" });

    expect(screen.getByText(/Max total.*token usage/)).toBeInTheDocument();
  });

  it("shows message-based column header when limitType is messages", () => {
    setup({ limitType: "messages" });

    expect(screen.getByText(/Max total.*messages/)).toBeInTheDocument();
  });

  it("populates inputs from existing tenant limits", () => {
    setup({
      tenantLimits: [
        { tenant_id: 1, max_usage: 1 },
        { tenant_id: 2, max_usage: 10 },
      ],
    });

    expect(screen.getByDisplayValue("1 million")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10 million")).toBeInTheDocument();
  });

  it("shows 'Unlimited' placeholder when instance limit is null", () => {
    setup({ instanceLimit: null });

    const inputs = screen.getAllByPlaceholderText("Unlimited");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("filters tenants by search query", async () => {
    setup();

    const searchInput = screen.getByPlaceholderText("Search...");
    await userEvent.type(searchInput, "Acme");

    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.queryByText("Beta Inc")).not.toBeInTheDocument();
  });

  it("shows all tenants when search is cleared", async () => {
    setup();

    const searchInput = screen.getByPlaceholderText("Search...");
    await userEvent.type(searchInput, "Acme");
    await userEvent.clear(searchInput);

    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Beta Inc")).toBeInTheDocument();
  });

  it("shows 'No tenants to show' when tenants list is empty", () => {
    setup({ tenants: [] });

    expect(screen.getByText("No tenants to show")).toBeInTheDocument();
  });

  it("shows error message when error is present", () => {
    setup({ hasError: true, tenants: undefined });
    expect(screen.getByText("Error loading tenants")).toBeInTheDocument();
  });

  it("updates input value when user types", async () => {
    setup();

    const acmeInput = screen.getByRole("textbox", {
      name: /Acme Corp/,
    });
    await userEvent.type(acmeInput, "300");

    expect(acmeInput).toHaveValue("300 million");
  });

  it("shows error when value exceeds the instance limit", async () => {
    setup({ instanceLimit: 100 });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const tenantInput = screen.getByLabelText(
      /Max total monthly tokens for Acme Corp/,
    );
    await userEvent.type(tenantInput, "200");

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(
        /Can't be higher than the instance limit/,
      );
    });
  });
});
