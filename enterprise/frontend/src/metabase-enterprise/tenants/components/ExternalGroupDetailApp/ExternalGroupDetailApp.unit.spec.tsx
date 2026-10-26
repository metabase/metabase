import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupUsersEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockGroup } from "metabase-types/api/mocks/group";

import { ExternalGroupDetailApp } from "./ExternalGroupDetailApp";

const TENANT_GROUP = {
  ...createMockGroup({
    id: 7,
    name: "Marketing Team",
    magic_group_type: null,
    is_tenant_group: true,
  }),
  members: [],
};

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
  fetchMock.get(`path:/api/permissions/group/${TENANT_GROUP.id}`, TENANT_GROUP);
  fetchMock.get("path:/api/permissions/membership", {});
  setupUsersEndpoints([TENANT_USER]);

  renderWithProviders(
    <Route
      path="/admin/people/tenants/groups/:groupId"
      element={<ExternalGroupDetailApp />}
    />,
    {
      withRouter: true,
      initialRoute: `/admin/people/tenants/groups/${TENANT_GROUP.id}`,
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
    expect(await screen.findByText(TENANT_GROUP.name)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Add members" }),
    ).toBeEnabled();
  });
});
