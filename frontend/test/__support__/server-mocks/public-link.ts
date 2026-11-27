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

type PublicLinksModel = "action" | "card" | "dashboard";

/**
 * Mocks `GET /api/<model>/public` as a list that the backend keeps:
 * `DELETE /api/<model>/:id/public_link` drops that item (404 for an unknown
 * id), so the refetch that follows the mutation returns the list without it.
 * The delete route is named `delete-public-<model>-link`.
 */
export function setupStatefulPublicLinksEndpoints<
  T extends { id: number | string },
>(model: PublicLinksModel, initialItems: T[]) {
  let items = [...initialItems];
  fetchMock.get(`path:/api/${model}/public`, () => items, {
    name: `list-public-${model}`,
  });
  fetchMock.delete(
    `express:/api/${model}/:id/public_link`,
    ({ url }) => {
      const id = new URL(url).pathname.split("/")[3];
      if (!items.some((item) => String(item.id) === id)) {
        return 404;
      }
      items = items.filter((item) => String(item.id) !== id);
      return 204;
    },
    { name: `delete-public-${model}-link` },
  );
}
