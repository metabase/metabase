import fetchMock from "fetch-mock";

import type { ActionSecret } from "metabase-types/api";
import { createMockActionSecret } from "metabase-types/api/mocks";

export function setupActionSecretsEndpoints(secrets: ActionSecret[]) {
  fetchMock.get("path:/api/action-secret", secrets, {
    name: "action-secret-list",
  });
  fetchMock.post(
    "path:/api/action-secret",
    createMockActionSecret({ id: 100 }),
    {
      name: "action-secret-post",
    },
  );
  secrets.forEach((secret) => {
    fetchMock.put(`path:/api/action-secret/${secret.id}`, secret, {
      name: `action-secret-${secret.id}-put`,
    });
    fetchMock.delete(`path:/api/action-secret/${secret.id}`, 204, {
      name: `action-secret-${secret.id}-delete`,
    });
  });
}
