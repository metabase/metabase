import type { ScheduleDisplayType, TransformJob } from "metabase-types/api";

export type TransformJobDetails = Pick<TransformJob, "tag_ids"> & {
  name?: string;
  description?: string | null;
  schedule?: string;
  ui_display_type?: ScheduleDisplayType;
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
    ui_display_type = "cron/raw",
    tag_ids,
  }: TransformJobDetails = {},
  {
    wrapId = false,
    idAlias = "transformJobId",
    visitTransformJob = false,
  }: CreateTransformJobOptions = {},
): Cypress.Chainable<Cypress.Response<TransformJob>> {
  return cy
    .request<TransformJob>("POST", "/api/transform-job", {
      name,
      description,
      schedule,
      ui_display_type,
      tag_ids,
    })
    .then(({ body }) => {
      if (wrapId) {
        cy.wrap(body.id).as(idAlias);
      }
      if (visitTransformJob) {
        cy.visit(`/data-studio/transforms/jobs/${body.id}`);
      }
    });
}
