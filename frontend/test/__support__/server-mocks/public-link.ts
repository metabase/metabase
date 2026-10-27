import fetchMock from "fetch-mock";

import type {
  PublicLinkEntity,
  PublicLinkRefusalResponse,
} from "metabase-types/api";

export function setupPublicLinkRefusalEndpoint(
  { model, id }: PublicLinkEntity,
  response: PublicLinkRefusalResponse = { refusal: null },
) {
  fetchMock.get(`path:/api/public-link-refusal/${model}/${id}`, response);
}
