import type { Transform } from "metabase-types/api";

export type TransformTagDetails = {
  name?: string;
};

export type CreateTransformTagOptions = {
  wrapId?: boolean;
  idAlias?: string;
};

export function createTransformTag(
  { name = "New tag" }: TransformTagDetails,
  {
    wrapId = false,
    idAlias = "transformTagId",
  }: CreateTransformTagOptions = {},
): Cypress.Chainable<Cypress.Response<Transform>> {
  return cy
    .request<Transform>("POST", "/api/ee/transform-tag", {
      name,
    })
    .then(({ body }) => {
      if (wrapId) {
        cy.wrap(body.id).as(idAlias);
      }
    });
}
