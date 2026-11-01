import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { createMockGroup, createMockTenant } from "metabase-types/api/mocks";

import { defaultUser, setup } from "./setup";

const ALL_TENANT_USERS = createMockGroup({
  id: 10,
  name: "All tenant users",
  magic_group_type: "all-external-users",
  is_tenant_group: true,
});

const TENANT_GROUP = createMockGroup({
  id: 11,
  name: "Favorites",
  magic_group_type: null,
  is_tenant_group: true,
});

const TENANT = createMockTenant({ id: 5, name: "Gizmos", slug: "gizmo" });

describe("EditUserModal - enterprise", () => {
  describe("tenant user", () => {
    const setupTenantUser = () =>
      setup({
        userData: {
          ...defaultUser,
          tenant_id: TENANT.id,
          user_group_memberships: [
            { id: ALL_TENANT_USERS.id, is_group_manager: false },
          ],
        },
        enterprisePlugins: ["sandboxes", "tenants"],
        external: true,
        groups: [ALL_TENANT_USERS, TENANT_GROUP],
        tenants: [TENANT],
      });

    it("asks for tenant groups rather than internal ones", async () => {
      setupTenantUser();

      expect(await screen.findByText("Tenant groups")).toBeInTheDocument();

      const groupRequests = (await findRequests("GET")).filter(({ url }) =>
        url.includes("/api/permissions/group"),
      );
      expect(groupRequests).toHaveLength(1);
      expect(groupRequests[0].url).toContain("tenancy=external");
    });
  });

  it("can add a user attribute", async () => {
    setup({
      userData: defaultUser,
      enterprisePlugins: ["sandboxes"],
    });

    const submitButton = await screen.findByText("Update");
    const addAttributeButton = await screen.findByText("Add an attribute");

    await userEvent.click(addAttributeButton);

    await userEvent.type(
      await screen.findByPlaceholderText("Key"),
      "favorite_pokemon",
    );
    await userEvent.type(
      await screen.findByPlaceholderText("Value"),
      "Pikachu",
    );

    await userEvent.click(submitButton);

    const call = fetchMock.callHistory.lastCall("path:/api/user/97", {
      method: "PUT",
    });
    const req = await call?.request?.json();

    expect(req).toEqual({
      first_name: "Ash",
      last_name: "Ketchum",
      email: "pikachuboy97@example.com",
      user_group_memberships: [],
      login_attributes: {
        favorite_pokemon: "Pikachu",
      },
    });
  });

  it("can add a user attribute to a user with no name (metabase#40750)", async () => {
    setup({
      userData: {
        ...defaultUser,
        first_name: null,
        last_name: null,
      },
      enterprisePlugins: ["sandboxes"],
    });

    const submitButton = await screen.findByText("Update");
    const addAttributeButton = await screen.findByText("Add an attribute");

    await userEvent.click(addAttributeButton);

    await userEvent.type(
      await screen.findByPlaceholderText("Key"),
      "favorite_pokemon",
    );
    await userEvent.type(
      await screen.findByPlaceholderText("Value"),
      "Pikachu",
    );

    await userEvent.click(submitButton);

    const call = fetchMock.callHistory.lastCall("path:/api/user/97", {
      method: "PUT",
    });
    const req = await call?.request?.json();

    expect(req).toEqual({
      first_name: null,
      last_name: null,
      email: "pikachuboy97@example.com",
      user_group_memberships: [],
      login_attributes: {
        favorite_pokemon: "Pikachu",
      },
    });
  });
});
