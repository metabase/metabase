import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupTenantEntpoints,
  setupUserEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import type { Group, Tenant, User } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { EditUserModal } from "../EditUserModal";

export const defaultUser = createMockUser({
  id: 97,
  first_name: "Ash",
  last_name: "Ketchum",
  email: "pikachuboy97@example.com",
  login_attributes: {},
});

export const setup = ({
  userData,
  enterprisePlugins,
  external = false,
  groups = [],
  tenants = [],
}: {
  userData: Partial<User>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  external?: boolean;
  groups?: Omit<Group, "members">[];
  tenants?: Tenant[];
}) => {
  setupUserEndpoints(createMockUser(userData));

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({}),
    settings: mockSettings(
      createMockSettings({
        "token-features": createMockTokenFeatures({
          advanced_permissions: true,
          sandboxes: true,
          tenants: true,
        }),
      }),
    ),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  setupGroupsEndpoint(groups);
  setupTenantEntpoints(tenants);
  fetchMock.get("path:/api/permissions/membership", {});

  // setupPermissionsGraphEndpoints([]);
  const onCloseSpy = jest.fn();
  renderWithProviders(
    <EditUserModal
      params={{ userId: String(userData.id) }}
      onClose={onCloseSpy}
      external={external}
    />,
    {
      storeInitialState,
    },
  );
  return { onCloseSpy };
};
