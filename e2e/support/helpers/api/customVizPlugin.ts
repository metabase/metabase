import type { CustomVizPlugin, CustomVizPluginId } from "metabase-types/api";

/**
 * Upload a packaged custom-viz bundle (.tgz) and register it as a plugin.
 * `tgzPath` must be an absolute path to a .tgz file on disk (typically a
 * fixture under `e2e/support/assets/`).
 *
 * `cy.request` returns the response body as an `ArrayBuffer` when the request
 * body is `FormData` (Cypress treats the whole exchange as binary). We decode
 * it back to a parsed JSON object so callers see the typed `CustomVizPlugin`.
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
      return cy.request<ArrayBuffer | CustomVizPlugin>({
        method: "POST",
        url: "/api/ee/custom-viz-plugin",
        body: formData,
        failOnStatusCode: false,
      });
    })
    .then(({ body, status }) => {
      // Cypress's `cy.request` always returns the response body as an
      // ArrayBuffer when the request body is `FormData` — even for JSON
      // responses. The buffer comes from a different realm than the spec's
      // `window.ArrayBuffer`, so `instanceof ArrayBuffer` returns false.
      // Decode unconditionally instead of branching.
      const bytes = new Uint8Array(body as ArrayBuffer);
      const text = new TextDecoder("utf-8").decode(bytes);
      if (status !== 200) {
        console.error(
          `[addCustomVizPlugin] upload failed (${status}): ${text}`,
        );
        throw new Error(`upload failed (${status}): ${text}`);
      }
      return JSON.parse(text) as CustomVizPlugin;
    });
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
