import type { ReleaseFlag } from "metabase-types/api";

export const setReleaseFlag = (flag: ReleaseFlag, value: boolean) =>
  cy.request({
    method: "PUT",
    url: "/api/release-flags",
    body: { [flag]: value },
    failOnStatusCode: false,
  });
