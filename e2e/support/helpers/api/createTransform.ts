import type { Transform } from "metabase-types/api";

export type TransformDetails = Pick<
  Transform,
  "source" | "target" | "tag_ids"
> & {
  name?: string;
  description?: string | null;
};

export type CreateTransformOptions = {
  wrapId?: boolean;
  idAlias?: string;
  visitTransform?: boolean;
};

export function createTransform(
  {
    name = "New transform",
    description = null,
    source,
    target,
    tag_ids,
  }: TransformDetails,
  {
    wrapId = false,
    idAlias = "transformId",
    visitTransform = false,
  }: CreateTransformOptions = {},
): Cypress.Chainable<Cypress.Response<Transform>> {
  return cy
    .request<Transform>("POST", "/api/ee/transform", {
      name,
      description,
      source,
      target,
      tag_ids,
    })
    .then(({ body }) => {
      if (wrapId) {
        cy.wrap(body.id).as(idAlias);
      }
      if (visitTransform) {
        cy.visit(`/admin/transforms/${body.id}`);
      }
    });
}
