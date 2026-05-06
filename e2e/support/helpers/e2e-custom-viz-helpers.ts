export const CUSTOM_VIZ_FIXTURE_TGZ =
  Cypress.config("projectRoot") +
  "/e2e/support/assets/example_custom_viz_plugin.tgz";

export const CUSTOM_VIZ_FIXTURE_TGZ_2 =
  Cypress.config("projectRoot") +
  "/e2e/support/assets/example_custom_viz_plugin_2.tgz";

// Identifier comes from the manifest's `name` field in the packaged bundle.
export const CUSTOM_VIZ_IDENTIFIER = "demo-viz";

export const CUSTOM_VIZ_IDENTIFIER_2 = "demo-viz-2";

// Frontend display type: "custom:{identifier}"
export const CUSTOM_VIZ_DISPLAY = `custom:${CUSTOM_VIZ_IDENTIFIER}` as const;

/**
 * Compute the SHA-256 of a .tgz fixture on disk via `shasum`. The chip on the
 * plugin list shows the first 8 chars, so tests that assert on the chip read
 * the hash through this helper instead of hardcoding it (which would drift
 * silently when the fixture is regenerated).
 */
export function getCustomVizFixtureHash(tgzPath: string) {
  return cy
    .exec(`shasum -a 256 ${tgzPath}`)
    .then(({ stdout }) => stdout.split(" ")[0]);
}

// -- Intercept helpers --

export function interceptPluginBundle() {
  cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*").as("pluginBundle");
}

export function interceptPluginList() {
  cy.intercept("GET", "/api/ee/custom-viz-plugin/list").as("pluginList");
}

export function interceptPluginCreate() {
  cy.intercept("POST", "/api/ee/custom-viz-plugin").as("pluginCreate");
}

export function interceptPluginRefresh() {
  cy.intercept("POST", "/api/ee/custom-viz-plugin/*/refresh").as(
    "pluginRefresh",
  );
}

export function waitForPluginBundle() {
  return cy.wait("@pluginBundle");
}

// -- Navigation helpers --

export function visitCustomVizSettings() {
  cy.visit("/admin/settings/custom-visualizations");
}

export function visitCustomVizNewForm() {
  cy.visit("/admin/settings/custom-visualizations/new");
}

export function visitCustomVizDevelopment() {
  cy.visit("/admin/settings/custom-visualizations/development");
}

export function visitCustomVizEditForm(id: number) {
  cy.visit(`/admin/settings/custom-visualizations/edit/${id}`);
}

// -- UI helpers --

export function getAddVisualizationLink() {
  return cy.findByRole("link", { name: /Add$/ });
}

/**
 * Drop a .tgz onto the custom-viz bundle dropzone.
 * Accepts a fixture path (string) or a Cypress FileReference for inline buffers.
 */
export function dropCustomVizBundle(
  file: Parameters<Cypress.Chainable["selectFile"]>[0],
) {
  return cy.get('input[type="file"]').selectFile(file, { force: true });
}

/**
 * Finds the custom viz plugin icon, which `EntityIcon` renders as a
 * CSS-masked `<span role="img" aria-label={display_name}>` rather than an
 * `<img>` element — so plain `img[src*=...]` selectors don't match.
 */
export function getCustomVizPluginIcon(displayName: string) {
  return cy.get("main").findByRole("img", { name: displayName });
}
