import type { CustomVizPlugin, CustomVizPluginId } from "metabase-types/api";

export function addCustomVizPlugin(
  repoUrl: string,
  accessToken?: string,
  pinnedVersion?: string,
): Cypress.Chainable<CustomVizPlugin> {
  return cy
    .request<CustomVizPlugin>("POST", "/api/ee/custom-viz-plugin", {
      repo_url: repoUrl,
      access_token: accessToken,
      pinned_version: pinnedVersion,
    })
    .then(({ body }) => body);
}

export function removeAllCustomVizPlugins() {
  cy.request<CustomVizPlugin[]>("GET", "/api/ee/custom-viz-plugin").then(
    ({ body: plugins }) => {
      for (const plugin of plugins) {
        cy.request("DELETE", `/api/ee/custom-viz-plugin/${plugin.id}`);
      }
    },
  );
}

export function refreshCustomVizPlugin(
  id: CustomVizPluginId,
): Cypress.Chainable<CustomVizPlugin> {
  return cy
    .request<CustomVizPlugin>("POST", `/api/ee/custom-viz-plugin/${id}/refresh`)
    .then(({ body }) => body);
}
