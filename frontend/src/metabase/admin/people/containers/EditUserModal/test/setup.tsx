import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupUserEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import type { User, UserListResult } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

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
}: {
  userData: Partial<User>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}) => {
  setupUserEndpoints(createMockUser(userData) as unknown as UserListResult);

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({}),
    settings: mockSettings(
      createMockSettings({
        "token-features": createMockTokenFeatures({
          advanced_permissions: true,
          sandboxes: true,
        }),
      }),
    ),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  fetchMock.get("path:/api/permissions/group", []);
  fetchMock.get("path:/api/permissions/membership", {});

  // setupPermissionsGraphEndpoints([]);
  const onCloseSpy = jest.fn();
  renderWithProviders(
    <EditUserModal
      params={{ userId: String(userData.id) }}
      onClose={onCloseSpy}
    />,
    {
      storeInitialState,
    },
  );
  return { onCloseSpy };
};
