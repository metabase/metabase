import fetchMock from "fetch-mock";

import type { PublicCard, PublicDataset } from "metabase-types/api";

export function setupPublicQuestionEndpoints(
  uuid: string,
  publicCard: PublicCard,
) {
  fetchMock.get(`path:/api/public/card/${uuid}`, publicCard);
}

export function setupPublicCardQueryEndpoints(
  uuid: string,
  publicDataset: PublicDataset,
) {
  fetchMock.get(`path:/api/public/card/${uuid}/query`, publicDataset);
}
