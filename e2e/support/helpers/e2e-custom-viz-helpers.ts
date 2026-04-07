import type { CustomVizPlugin } from "metabase-types/api";

export const CUSTOM_VIZ_REPO_PATH =
  Cypress.config("projectRoot") + "/e2e/tmp/custom-viz-repo";

export const CUSTOM_VIZ_REPO_URL = "file://" + CUSTOM_VIZ_REPO_PATH + "/.git";

export const CUSTOM_VIZ_FIXTURE_PATH =
  Cypress.config("projectRoot") +
  "/e2e/support/assets/example_custom_viz_plugin";

// Backend derives identifier from the last URL path segment
export const CUSTOM_VIZ_IDENTIFIER = "custom-viz-repo";

// Frontend display type: "custom:{identifier}"
export const CUSTOM_VIZ_DISPLAY = `custom:${CUSTOM_VIZ_IDENTIFIER}`;

/**
 * Initialize a local git repo with the plugin fixture committed.
 * Creates a fresh repo each time, copies the fixture, and commits.
 */
export function setupCustomVizRepo() {
  cy.exec("rm -rf " + CUSTOM_VIZ_REPO_PATH);
  cy.exec("git config --global init.defaultBranch main");
  cy.exec("git init " + CUSTOM_VIZ_REPO_PATH);
  cy.exec(
    `git -C ${CUSTOM_VIZ_REPO_PATH} config user.email 'toucan@metabase.com'; git -C ${CUSTOM_VIZ_REPO_PATH} config user.name 'Toucan Cam'`,
  );
  cy.task("copyDirectory", {
    source: CUSTOM_VIZ_FIXTURE_PATH,
    destination: CUSTOM_VIZ_REPO_PATH,
  });
  cy.exec(
    `git -C ${CUSTOM_VIZ_REPO_PATH} add . && git -C ${CUSTOM_VIZ_REPO_PATH} commit -m 'Initial plugin commit'`,
  );
}

/**
 * Register a custom viz plugin via API (fast path).
 * The backend clone is synchronous — returns the plugin with status.
 */
export function addCustomVizPlugin(
  repoUrl = CUSTOM_VIZ_REPO_URL,
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

/**
 * Setup local repo + register plugin in one call.
 * This is the most common beforeEach pattern for tests
 * that need a working plugin but don't test the install flow.
 */
export function setupCustomVizPlugin(): Cypress.Chainable<CustomVizPlugin> {
  setupCustomVizRepo();
  return addCustomVizPlugin();
}

// -- Intercept helpers --

export function interceptPluginBundle() {
  cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle").as("pluginBundle");
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

// -- Plugin management helpers --

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
  id: number,
): Cypress.Chainable<CustomVizPlugin> {
  return cy
    .request<CustomVizPlugin>("POST", `/api/ee/custom-viz-plugin/${id}/refresh`)
    .then(({ body }) => body);
}

/**
 * Update the fixture in the local git repo and commit.
 * The updateFn receives the repo path and can use cy.writeFile / cy.exec
 * to modify files before the commit.
 */
export function updateFixtureAndCommit(
  updateFn: () => void,
  commitMessage = "Update plugin",
) {
  updateFn();
  cy.exec(
    `git -C ${CUSTOM_VIZ_REPO_PATH} add . && git -C ${CUSTOM_VIZ_REPO_PATH} commit -am '${commitMessage}'`,
  );
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
