import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAddDataAppGroupsEndpoint,
  setupDataAppGroupsEndpoint,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
  createMockDataApp,
  createMockDataAppGroup,
  createMockGroup,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { AddDataAppGroupsModal } from "./AddDataAppGroupsModal";

function setup({ useTenants = false, hasTenantsFeature = false } = {}) {
  setupGroupsEndpoint([
    createMockGroup({
      id: 1,
      name: "All Users",
      magic_group_type: "all-internal-users",
    }),
    createMockGroup({
      id: 2,
      name: "Administrators",
      magic_group_type: "admin",
    }),
    createMockGroup({ id: 3, name: "Support" }),
    createMockGroup({ id: 4, name: "Finance" }),
    createMockGroup({ id: 5, name: "Tenant support", is_tenant_group: true }),
  ]);
  const support = createMockDataAppGroup({
    id: 3,
    name: "Support",
    member_count: 12,
  });
  setupDataAppGroupsEndpoint("sales", [support]);
  setupAddDataAppGroupsEndpoint("sales", [
    support,
    createMockDataAppGroup({ id: 4, name: "Finance", member_count: 4 }),
  ]);
  const onClose = jest.fn<void, []>();
  renderWithProviders(
    <AddDataAppGroupsModal
      app={createMockDataApp({ name: "sales", display_name: "Sales" })}
      onClose={onClose}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings(
          createMockSettings({
            "use-tenants": useTenants,
            "token-features": createMockTokenFeatures({
              tenants: hasTenantsFeature,
            }),
          }),
        ),
      }),
    },
  );
  return { onClose };
}

describe("AddDataAppGroupsModal", () => {
  it("offers only groups the app doesn't have and adds the selected ones", async () => {
    const { onClose } = setup();

    expect(await screen.findByText("Add groups to Sales")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("textbox", { name: "Groups" }));

    expect(
      await screen.findByRole("option", { name: "Finance" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Support" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Administrators" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: "Finance" }));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const calls = fetchMock.callHistory.calls(
      "path:/api/ee/apps/sales/groups",
      {
        method: "POST",
      },
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].options.body))).toEqual({
      group_ids: [4],
    });
  });

  it("removes the last selected group with Backspace when search is empty", async () => {
    setup();

    const input = await screen.findByRole("textbox", { name: "Groups" });

    // add all users group
    await userEvent.click(input);
    await userEvent.click(
      await screen.findByRole("option", { name: "All Users" }),
    );

    // add finance group
    await userEvent.click(input);
    await userEvent.click(screen.getByRole("option", { name: "Finance" }));

    expect(
      screen.getByRole("listitem", { name: "Finance" }),
    ).toBeInTheDocument();

    // remove the last group
    await userEvent.click(input);
    await userEvent.keyboard("{Backspace}");

    // finance group should be removed
    expect(
      screen.queryByRole("listitem", { name: "Finance" }),
    ).not.toBeInTheDocument();

    // all users group still remains
    expect(
      screen.getByRole("listitem", { name: "All Users" }),
    ).toBeInTheDocument();
  });

  it.each([
    {
      name: "tenants are disabled",
      useTenants: false,
      hasTenantsFeature: true,
    },
    {
      name: "tenant feature token is missing",
      useTenants: true,
      hasTenantsFeature: false,
    },
  ])("hides tenant group when $name", async (options) => {
    setup(options);

    await userEvent.click(
      await screen.findByRole("textbox", { name: "Groups" }),
    );

    expect(
      await screen.findByRole("option", { name: "Finance" }),
    ).toBeInTheDocument();

    // tenant group should be hidden
    expect(
      screen.queryByRole("option", { name: /Tenant support/ }),
    ).not.toBeInTheDocument();
  });

  it("includes tenant groups when tenants and its feature token are enabled", async () => {
    setup({ useTenants: true, hasTenantsFeature: true });

    await userEvent.click(
      await screen.findByRole("textbox", { name: "Groups" }),
    );

    const tenantOption = await screen.findByRole("option", {
      name: "Tenant support",
    });

    // in the pill, tenant group icon should be shown
    expect(
      within(tenantOption).getByRole("img", { name: "Tenant group" }),
    ).toHaveClass("Icon-globe");

    // internal group should not have an icon
    expect(
      within(screen.getByRole("option", { name: "Finance" })).queryByRole(
        "img",
      ),
    ).not.toBeInTheDocument();

    await userEvent.click(tenantOption);

    // in the dropdown, tenant group icon should be shown
    const tenantPill = screen.getByRole("listitem", { name: "Tenant support" });
    expect(
      within(tenantPill).getByRole("img", { name: "Tenant group" }),
    ).toHaveClass("Icon-globe");

    const groupRequest = fetchMock.callHistory.calls(
      "path:/api/permissions/group",
    )[0];

    // include both internal and tenant groups - don't filter by tenancy
    expect(new URL(groupRequest.url).searchParams.get("tenancy")).toBeNull();
  });
});
