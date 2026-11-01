import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupTenantEntpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { Tenant } from "metabase-types/api";
import {
  createMockTenant,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { TenantsListingApp } from "./TenantsListingApp";

const setup = ({
  tenants = [],
  isAdmin = true,
}: {
  tenants?: Tenant[];
  isAdmin?: boolean;
} = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ tenants: true }),
  });

  setupEnterprisePlugins();
  setupTenantEntpoints(tenants);

  const currentUser = createMockUser({ is_superuser: isAdmin });

  renderWithProviders(<TenantsListingApp />, {
    storeInitialState: createMockState({
      settings,
      currentUser,
    }),
  });
};

describe("TenantsListingApp", () => {
  it("shows tenant documentation button", async () => {
    setup();

    const docLinks = await screen.findAllByRole("link");
    const docButton = docLinks.find((link) =>
      link.getAttribute("href")?.includes("embedding/tenants"),
    );
    expect(docButton).toBeInTheDocument();
    expect(docButton).toHaveAttribute("target", "_blank");
  });

  it("shows edit user strategy button for admins", async () => {
    setup({ isAdmin: true });

    const gearIcon = await screen.findByLabelText("gear icon");
    expect(gearIcon).toBeInTheDocument();
  });

  it("shows empty state when there are no tenants", async () => {
    setup({ tenants: [] });

    expect(
      await screen.findByText(/Create your first tenant to start adding/i),
    ).toBeInTheDocument();
  });

  it("shows tenants list when tenants exist", async () => {
    setup({
      tenants: [
        createMockTenant({ id: 1, name: "Tenant One", slug: "tenant-one" }),
        createMockTenant({ id: 2, name: "Tenant Two", slug: "tenant-two" }),
      ],
    });

    expect(await screen.findByText("Tenant One")).toBeInTheDocument();
    expect(await screen.findByText("Tenant Two")).toBeInTheDocument();
  });

  it("shows new tenant button for admins", async () => {
    setup({ isAdmin: true, tenants: [createMockTenant()] });

    expect(await screen.findByText("New tenant")).toBeInTheDocument();
  });

  describe("active and deactivated tabs", () => {
    const ACTIVE_TENANT = createMockTenant({
      id: 1,
      name: "Parrot",
      slug: "parrot",
      is_active: true,
    });

    const DEACTIVATED_TENANT = createMockTenant({
      id: 2,
      name: "Eagle",
      slug: "eagle",
      is_active: false,
    });

    it("lists only active tenants, and only the deactivated ones on the other tab", async () => {
      setup({ tenants: [ACTIVE_TENANT, DEACTIVATED_TENANT] });

      expect(await screen.findByText("Parrot")).toBeInTheDocument();
      expect(screen.queryByText("Eagle")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("tab", { name: "Deactivated" }));

      expect(await screen.findByText("Eagle")).toBeInTheDocument();
      expect(screen.queryByText("Parrot")).not.toBeInTheDocument();
    });

    it("offers no tabs while every tenant is active", async () => {
      setup({ tenants: [ACTIVE_TENANT] });

      expect(await screen.findByText("Parrot")).toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: "Deactivated" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: "Active" }),
      ).not.toBeInTheDocument();
    });

    it("offers no tabs to a non-admin", async () => {
      setup({ isAdmin: false, tenants: [ACTIVE_TENANT, DEACTIVATED_TENANT] });

      expect(await screen.findByText("Parrot")).toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: "Deactivated" }),
      ).not.toBeInTheDocument();
    });
  });
});
