import type { CreateTransformRequest, Transform } from "metabase-types/api";

export type Options = {
  wrapId?: boolean;
  idAlias?: string;
};

export function createTransform(
  request: CreateTransformRequest,
  { wrapId = false, idAlias = "transformId" }: Options = {},
): Cypress.Chainable<Cypress.Response<Transform>> {
  return cy
    .request<Transform>("POST", "/api/ee/transform", request)
    .then(({ body }) => {
      if (wrapId) {
        cy.wrap(body.id).as(idAlias);
      }
    });
}
