import fetchMock from "fetch-mock";

import type {
  PublicLinkEntity,
  PublicLinkRefusalResponse,
} from "metabase-types/api";

const routeName = ({ model, id }: PublicLinkEntity) =>
  `public-link-refusal-${model}-${id}`;

const routePath = ({ model, id }: PublicLinkEntity) =>
  `path:/api/public-link-refusal/${model}/${id}`;

export function setupPublicLinkRefusalEndpoint(
  entity: PublicLinkEntity,
  response: PublicLinkRefusalResponse | Promise<PublicLinkRefusalResponse> = {
    refusal: null,
  },
) {
  const name = routeName(entity);
  fetchMock.removeRoute(name);
  fetchMock.get(routePath(entity), response, { name });
}

export function setupPublicLinkRefusalEndpointWithError(
  entity: PublicLinkEntity,
) {
  const name = routeName(entity);
  fetchMock.removeRoute(name);
  fetchMock.get(routePath(entity), { status: 500, body: {} }, { name });
}
