import fetchMock from "fetch-mock";

import type {
  MetabotApiEntity,
  MetabotId,
  MetabotInfo,
} from "metabase-types/api";

export function setupMetabotsEndpoint(metabots: MetabotInfo[]) {
  fetchMock.get("path:/api/ee/metabot-v3/metabots", { items: metabots });
}

export function setupMetabotEntitiesEndpoint(
  metabotId: MetabotId,
  entities: MetabotApiEntity[],
) {
  fetchMock.get(
    `path:/api/ee/metabot-v3/metabots/${metabotId}/entities`,
    { items: entities },
    { overwriteRoutes: true },
  );
}

export function setupMetabotAddEntitiesEndpoint(metabotId: MetabotId) {
  fetchMock.put(`path:/api/ee/metabot-v3/metabots/${metabotId}/entities`, {
    status: 204,
  });
}

export function setupMetabotDeleteEntitiesEndpoint() {
  fetchMock.delete(/api\/ee\/metabot-v3\/metabots\/\d+\/entities/, {
    status: 204,
  });
}
