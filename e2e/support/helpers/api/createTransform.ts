import type { Collection, CollectionId, Transform } from "metabase-types/api";

export type TransformDetails = Pick<
  Transform,
  "source" | "target" | "tag_ids"
> & {
  name?: string;
  description?: string | null;
  collection_id?: CollectionId | null;
};

export type CreateTransformOptions = {
  wrapId?: boolean;
  idAlias?: string;
  visitTransform?: boolean;
};

function getTransformsRootCollectionId(): Cypress.Chainable<CollectionId> {
  return cy
    .request<Collection>("GET", "/api/collection/root?namespace=transforms")
    .then((response) => response.body.id);
}

export function createTransform(
  {
    name = "New transform",
    description = null,
    source,
    target,
    tag_ids,
    collection_id,
  }: TransformDetails,
  {
    wrapId = false,
    idAlias = "transformId",
    visitTransform = false,
  }: CreateTransformOptions = {},
): Cypress.Chainable<Cypress.Response<Transform>> {
  return getTransformsRootCollectionId()
    .then((rootCollectionId) =>
      cy.request<Transform>("POST", "/api/transform", {
        name,
        description,
        source,
        target,
        tag_ids,
        collection_id: collection_id ?? rootCollectionId,
      }),
    )
    .then((response) => {
      if (wrapId) {
        cy.wrap(response.body.id).as(idAlias);
      }
      if (visitTransform) {
        cy.visit(`/data-studio/transforms/${response.body.id}`);
      }
      return cy.wrap(response);
    });
}
