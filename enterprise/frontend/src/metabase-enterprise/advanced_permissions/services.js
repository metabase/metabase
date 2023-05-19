import { GET } from "metabase/lib/api";

export const ImpersonationApi = {
  _get: GET("/api/impersonation/:groupId/:databaseId"),
  get: ({ groupId, databaseId }) =>
    groupId % 2 !== 0
      ? Promise.resolve({
          group_id: groupId,
          db_id: databaseId,
          attribute: "foo",
        })
      : Promise.resolve(null),
};
