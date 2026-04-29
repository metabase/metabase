import fetchMock from "fetch-mock";

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import { setupUserEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import type { User, UserListResult } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

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
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
}) => {
  setupUserEndpoints(createMockUser(userData) as unknown as UserListResult);

  fetchMock.get("path:/api/permissions/group", []);
  fetchMock.get("path:/api/permissions/membership", {});

  const { render } = createScenario()
    .withEnterprise({
      plugins: enterprisePlugins,
      tokenFeatures: { advanced_permissions: true, sandboxes: true },
    })
    .build();

  const onCloseSpy = jest.fn();
  render(
    <EditUserModal
      params={{ userId: String(userData.id) }}
      onClose={onCloseSpy}
    />,
    {
      storeInitialState: { entities: createMockEntitiesState({}) },
    },
  );
  return { onCloseSpy };
};
