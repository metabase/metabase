import fetchMock from "fetch-mock";

import type { PublicCard, EmbedDataset } from "metabase-types/api";

export function setupPublicQuestionEndpoints(
  uuid: string,
  publicCard: PublicCard,
) {
  fetchMock.get(`path:/api/public/card/${uuid}`, publicCard);
}

export function setupPublicCardQueryEndpoints(
  uuid: string,
  publicDataset: EmbedDataset,
) {
  fetchMock.get(`path:/api/public/card/${uuid}/query`, publicDataset);
}
