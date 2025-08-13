import type { TransformJob } from "metabase-types/api";

export type TransformJobDetails = Pick<TransformJob, "tag_ids"> & {
  name?: string;
  description?: string | null;
  schedule?: string;
};

export type CreateTransformJobOptions = {
  wrapId?: boolean;
  idAlias?: string;
  visitTransformJob?: boolean;
};

export function createTransformJob(
  {
    name = "New transform",
    description = null,
    schedule = "0 0 0 * * ? *",
    tag_ids,
  }: TransformJobDetails = {},
  {
    wrapId = false,
    idAlias = "transformJobId",
    visitTransformJob = false,
  }: CreateTransformJobOptions = {},
): Cypress.Chainable<Cypress.Response<TransformJob>> {
  return cy
    .request<TransformJob>("POST", "/api/ee/transform-job", {
      name,
      description,
      schedule,
      tag_ids,
    })
    .then(({ body }) => {
      if (wrapId) {
        cy.wrap(body.id).as(idAlias);
      }
      if (visitTransformJob) {
        cy.visit(`/admin/transforms/jobs/${body.id}`);
      }
    });
}
