import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import type { User, UserListResult } from "metabase-types/api";
import {
  createMockUser,
  createMockSettings,
  createMockTokenFeatures,
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
  hasEnterprisePlugins = false,
}: {
  userData: Partial<User>;
  hasEnterprisePlugins?: boolean;
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

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
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
