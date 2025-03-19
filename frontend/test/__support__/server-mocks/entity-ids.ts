import fetchMock from "fetch-mock";

import type { Card, Collection, Dashboard } from "metabase-types/api";

type MockData =
  | { type: "collection"; data: Collection[] }
  | { type: "card"; data: Card[] }
  | { type: "dashboard"; data: Dashboard[] };

export function setupTranslateEntityIdEndpoints(mockData: MockData) {
  return fetchMock.post("path:/api/util/entity_id", async (_, options) => {
    const requestEntities = (await options.body)?.toString();

    if (!requestEntities) {
      return {
        status: 500,
      };
    }

    const parsedBody = JSON.parse(requestEntities);
    const typeDict = parsedBody.entity_ids;
    const entityIdList = typeDict[mockData.type];

    const idSearchList = entityIdList.map((idToFind: string) => {
      const entityObj = mockData.data.find(obj => obj.entity_id === idToFind);

      if (entityObj) {
        return [
          idToFind,
          {
            id: entityObj.id,
            status: "ok",
            type: mockData.type,
          },
        ];
      } else {
        return [
          idToFind,
          {
            id: null,
            status: "not-found",
            type: mockData.type,
          },
        ];
      }
    });

    return {
      body: { entity_ids: Object.fromEntries(idSearchList) },
      status: 200,
    };
  });
}
