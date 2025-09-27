import type {
  ListTransformRunsResponse,
  TransformId,
  TransformRun,
} from "metabase-types/api";

export function visitTransform(transformId: TransformId) {
  cy.visit(`/admin/transforms/${transformId}`);
}

const WAIT_TIMEOUT = 10000;
const WAIT_INTERVAL = 100;

export function waitForTransformRuns(
  filter: (runs: TransformRun[]) => boolean,
  timeout = WAIT_TIMEOUT,
): Cypress.Chainable {
  return cy
    .request<ListTransformRunsResponse>("GET", "/api/ee/transform/run")
    .then((response) => {
      if (filter(response.body.data)) {
        return cy.wrap(response);
      } else if (timeout > 0) {
        cy.wait(WAIT_INTERVAL);
        return waitForTransformRuns(filter, timeout - WAIT_INTERVAL);
      } else {
        throw new Error("Run retry timeout");
      }
    });
}

export function waitForSucceededTransformRuns() {
  waitForTransformRuns(
    (runs) =>
      runs.length > 0 && runs.every((run) => run.status === "succeeded"),
  );
}
