import type { CustomVizPlugin, CustomVizPluginId } from "metabase-types/api";

/**
 * Upload a packaged custom-viz bundle (.tgz) and register it as a plugin.
 * `tgzPath` must be an absolute path to a .tgz file on disk (typically a
 * fixture under `e2e/support/assets/`).
 */
export function addCustomVizPlugin(
  tgzPath: string,
): Cypress.Chainable<CustomVizPlugin> {
  return cy
    .readFile(tgzPath, "binary")
    .then((fileContent: string) => {
      const blob = Cypress.Blob.binaryStringToBlob(
        fileContent,
        "application/gzip",
      );
      const formData = new FormData();
      formData.append("file", blob, "plugin.tgz");
      return cy.request<CustomVizPlugin>({
        method: "POST",
        url: "/api/ee/custom-viz-plugin",
        body: formData,
      });
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
