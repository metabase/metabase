import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCreateMembershipEndpoint,
  setupGroupEndpoint,
  setupPermissionMembershipEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Group } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockGroup } from "metabase-types/api/mocks/group";

import { ExternalGroupDetailApp } from "./ExternalGroupDetailApp";

const TENANT_GROUP_ID = 7;
const TENANT_GROUP_NAME = "Marketing Team";

const TENANT_USER = createMockUser({
  id: 3,
  first_name: "gizmo",
  last_name: "user",
  common_name: "gizmo user",
  email: "gizmo.user@email.com",
  tenant_id: 1,
});

const SETTINGS_STATE = mockSettings({
  "token-features": createMockTokenFeatures({ tenants: true }),
  "use-tenants": true,
});

// The plugin reads the token at registration, so the settings have to be in
// place before it is registered.
beforeAll(() => {
  setupEnterpriseOnlyPlugin("tenants");
});

const setup = () => {
  // The create-membership endpoint appends to this group, so each test needs
  // one of its own.
  const group: Group = {
    ...createMockGroup({
      id: TENANT_GROUP_ID,
      name: TENANT_GROUP_NAME,
      magic_group_type: null,
      is_tenant_group: true,
    }),
    members: [],
  };

  setupGroupEndpoint(group);
  setupCreateMembershipEndpoint(group, [TENANT_USER]);
  setupPermissionMembershipEndpoint({});
  setupUsersEndpoints([TENANT_USER]);

  renderWithProviders(
    <Route
      path="/admin/people/tenants/groups/:groupId"
      element={<ExternalGroupDetailApp />}
    />,
    {
      withRouter: true,
      initialRoute: `/admin/people/tenants/groups/${TENANT_GROUP_ID}`,
      storeInitialState: createMockState({
        settings: SETTINGS_STATE,
        currentUser: createMockUser({ id: 1, is_superuser: true }),
      }),
    },
  );
};

describe("ExternalGroupDetailApp", () => {
  it("shows the tenant group under the tenant groups heading", async () => {
    setup();

    expect(
      await screen.findByRole("heading", { name: "Tenant groups" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(TENANT_GROUP_NAME)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Add members" }),
    ).toBeEnabled();
  });

  it("shows a newly added member in the table without a reload", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Add members" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText(/Julie McMemberson/),
      "gizmo",
    );
    await userEvent.click(await screen.findByText(TENANT_USER.common_name));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText(TENANT_USER.email)).toBeInTheDocument();
  });
});
