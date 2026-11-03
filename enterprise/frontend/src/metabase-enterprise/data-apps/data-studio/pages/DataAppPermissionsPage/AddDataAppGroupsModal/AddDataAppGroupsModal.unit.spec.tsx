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
  it("includes tenant groups when tenants are enabled and licensed", async () => {
    const { onClose } = setup({ useTenants: true, hasTenantsFeature: true });

    await userEvent.click(
      await screen.findByRole("textbox", { name: "Groups" }),
    );
    const tenantOption = await screen.findByRole("option", {
      name: "Tenant support",
    });

    expect(
      within(tenantOption).getByRole("img", { name: "Tenant group" }),
    ).toHaveClass("Icon-globe");
    expect(
      within(screen.getByRole("option", { name: "Finance" })).queryByRole(
        "img",
      ),
    ).not.toBeInTheDocument();

    await userEvent.click(tenantOption);

    const tenantPill = screen.getByRole("listitem", { name: "Tenant support" });

    expect(
      within(tenantPill).getByRole("img", { name: "Tenant group" }),
    ).toHaveClass("Icon-globe");
    expect(screen.queryByText(/\(tenant group\)/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const requests = fetchMock.callHistory.calls(
      "path:/api/ee/apps/sales/groups",
      { method: "POST" },
    );
    expect(requests).toHaveLength(1);
    expect(JSON.parse(String(requests[0].options.body))).toEqual({
      group_ids: [5],
    });

    const groupRequest = fetchMock.callHistory.calls(
      "path:/api/permissions/group",
    )[0];
    expect(new URL(groupRequest.url).searchParams.get("tenancy")).toBeNull();
  });

  it("searches, selects, and removes groups with the keyboard", async () => {
    setup();

    const input = await screen.findByRole("textbox", { name: "Groups" });

    await waitFor(() => expect(input).toBeEnabled());
    await userEvent.type(input, "Fin");

    expect(
      await screen.findByRole("option", { name: "Finance" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "All Users" }),
    ).not.toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}{Enter}");

    const pill = screen.getByRole("listitem", { name: "Finance" });

    expect(within(pill).queryByRole("img")).not.toBeInTheDocument();

    await userEvent.click(
      within(pill).getByRole("button", { name: "Remove Finance" }),
    );

    expect(
      screen.queryByRole("listitem", { name: "Finance" }),
    ).not.toBeInTheDocument();

    await userEvent.click(input);
    await userEvent.click(
      await screen.findByRole("option", { name: "Finance" }),
    );
    await userEvent.click(input);
    await userEvent.keyboard("{Backspace}");

    expect(
      screen.queryByRole("listitem", { name: "Finance" }),
    ).not.toBeInTheDocument();

    await userEvent.type(input, "Unknown group{Enter}");

    expect(await screen.findByText("No groups found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it.each([
    { useTenants: false, hasTenantsFeature: true },
    { useTenants: true, hasTenantsFeature: false },
  ])(
    "excludes tenant groups without the setting and feature together: %p",
    async (options) => {
      setup(options);

      await userEvent.click(
        await screen.findByRole("textbox", { name: "Groups" }),
      );
      expect(
        await screen.findByRole("option", { name: "Finance" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /Tenant support/ }),
      ).not.toBeInTheDocument();
    },
  );

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
});
