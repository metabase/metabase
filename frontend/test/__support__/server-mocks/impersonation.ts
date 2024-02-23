import fetchMock from "fetch-mock";

import type { DatabaseId, GroupId, Impersonation } from "metabase-types/api";

export const setupExistingImpersonationEndpoint = (
  impersonation: Impersonation,
) => {
  fetchMock.get(
    {
      url: `path:/api/ee/advanced-permissions/impersonation`,
      query: {
        db_id: impersonation.db_id,
        group_id: impersonation.group_id,
      },
    },
    impersonation,
  );
};

export const setupMissingImpersonationEndpoint = (
  databaseId: DatabaseId,
  groupId: GroupId,
) => {
  fetchMock.get(
    {
      url: `path:/api/ee/advanced-permissions/impersonation`,
      query: {
        db_id: databaseId,
        group_id: groupId,
      },
    },
    () => null,
  );
};
