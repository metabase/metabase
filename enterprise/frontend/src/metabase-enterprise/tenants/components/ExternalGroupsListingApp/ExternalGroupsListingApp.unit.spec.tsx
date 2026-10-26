import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupApiKeyEndpoints,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockGroup } from "metabase-types/api/mocks/group";

import { ExternalGroupsListingApp } from "./ExternalGroupsListingApp";

const INTERNAL_GROUP = createMockGroup({
  id: 3,
  name: "Engineering",
  magic_group_type: null,
  is_tenant_group: false,
});

const TENANT_GROUP = createMockGroup({
  id: 4,
  name: "Favorites",
  magic_group_type: null,
  is_tenant_group: true,
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
  setupGroupsEndpoint([INTERNAL_GROUP, TENANT_GROUP]);
  setupApiKeyEndpoints([]);

  renderWithProviders(<ExternalGroupsListingApp />, {
    storeInitialState: createMockState({
      settings: SETTINGS_STATE,
      currentUser: createMockUser({ is_superuser: true }),
    }),
  });
};

describe("ExternalGroupsListingApp", () => {
  it("is the tenant half of the groups page", async () => {
    setup();

    expect(
      await screen.findByRole("heading", { name: "Tenant groups" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        /Use tenant groups to manage access for tenant users/,
      ),
    ).toBeInTheDocument();
  });

  it("lists tenant groups only", async () => {
    setup();

    expect(await screen.findByText(TENANT_GROUP.name)).toBeInTheDocument();
    expect(screen.queryByText(INTERNAL_GROUP.name)).not.toBeInTheDocument();
  });
});
